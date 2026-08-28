import { describe, it, expect } from "vitest";
import { addressPrefixes, addressPrefixClause } from "@/lib/jisCityAlias";
import fs from "fs";
import path from "path";

/**
 * 「ケ / ヶ」の表記ゆれを吸収する綴りの生成。
 *
 * 実測（2026-08-28 の probe）で、神奈川県横浜市保土ケ谷区が
 * 正式名 1342 件 / 別表記 474 件に割れていて、後者が集計から
 * 丸ごと落ちていた。
 */
describe("addressPrefixes", () => {
  it("ケ / ヶ を含まない名前は 1 通りのまま", () => {
    expect(addressPrefixes("東京都新宿区")).toEqual(["東京都新宿区"]);
    expect(addressPrefixes("三重県四日市市")).toEqual(["三重県四日市市"]);
  });

  it("大文字の「ケ」が正式名なら小文字の別表記を足す", () => {
    expect(addressPrefixes("神奈川県横浜市保土ケ谷区")).toEqual([
      "神奈川県横浜市保土ケ谷区",
      "神奈川県横浜市保土ヶ谷区",
    ]);
  });

  it("小文字の「ヶ」が正式名なら大文字の別表記を足す", () => {
    expect(addressPrefixes("神奈川県茅ヶ崎市")).toEqual([
      "神奈川県茅ヶ崎市",
      "神奈川県茅ケ崎市",
    ]);
  });

  it("先頭は必ず正式名（表示や照合はこちらを使う）", () => {
    for (const n of ["千葉県鎌ケ谷市", "埼玉県鶴ヶ島市", "大阪府大阪市北区"]) {
      expect(addressPrefixes(n)[0]).toBe(n);
    }
  });

  it("市区町村名以外の「ケ」には反応しない（そもそも含まない）", () => {
    // 「ケ」を含まない普通の名前で綴りが増えないことを、
    // JIS の対照表の全件で確かめる。増えるのは 17 件だけのはず。
    const jis = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "scripts", "jis_city_codes.json"),
        "utf-8",
      ),
    ) as Record<string, Array<{ code: string; name: string }>>;
    let expanded = 0;
    let total = 0;
    for (const cities of Object.values(jis)) {
      for (const c of cities) {
        total += 1;
        if (addressPrefixes(c.name).length > 1) expanded += 1;
      }
    }
    expect(total).toBeGreaterThan(1500);
    expect(expanded).toBe(17);
  });
});

describe("addressPrefixClause", () => {
  it("1 通りなら今までと同じ 1 条件になる", () => {
    const { sql, params } = addressPrefixClause("東京都新宿区");
    expect(sql).toBe("(address LIKE $1 || '%')");
    expect(params).toEqual(["東京都新宿区"]);
  });

  it("2 通りなら OR で並べ、括弧で閉じる", () => {
    const { sql, params } = addressPrefixClause("神奈川県横浜市保土ケ谷区");
    expect(sql).toBe("(address LIKE $1 || '%' OR address LIKE $2 || '%')");
    expect(params).toEqual([
      "神奈川県横浜市保土ケ谷区",
      "神奈川県横浜市保土ヶ谷区",
    ]);
  });

  it("startIndex をずらすと番号が続く", () => {
    const { sql } = addressPrefixClause("千葉県袖ケ浦市", 3);
    expect(sql).toBe("(address LIKE $3 || '%' OR address LIKE $4 || '%')");
  });

  // 括弧が無いと、呼び出し側が AND で繋いだ後ろの条件を OR が食う。
  // 生存条件（LIVE_LISTING_SQL）ごと外れて、期限切れの物件まで
  // 数え始めることになるので、1 通りのときも括弧を落とさない。
  it("1 通りのときも括弧を落とさない", () => {
    expect(addressPrefixClause("京都府京都市南区").sql.startsWith("(")).toBe(
      true,
    );
  });
});
