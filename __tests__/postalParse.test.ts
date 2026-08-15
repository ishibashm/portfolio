import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 郵便番号データ（日本郵便の ken_all）の読み取り。
 *
 * 町域の列には案内文が混ざる。「以下に掲載がない場合」「次に番地がくる
 * 場合」は町域名ではないので落とすが、**落とす順を間違えると町名まで
 * 消える**。「千代田（次に番地がくる場合）」は括弧を先に外せば「千代田」
 * が残るのに、先に案内文で判定すると町域ごと空になり、
 * 東京都千代田区千代田 が 東京都千代田区 になってしまう。
 *
 * 郵便番号から出る住所がずれると、そこから引く座標もずれ、**方位が
 * 変わる**。入力を楽にするための機能で判定を狂わせては本末転倒なので、
 * 代表的な形を固定しておく。
 *
 * 実装は scripts/import_postal_codes.ts。scripts は tsc の対象外
 * （CLAUDE.md 4 節）なので、ここでは同じ規則を写して検証する。
 * 写しがずれないよう、実装側に規則が残っていることも見る。
 */

/** scripts/import_postal_codes.ts の parseLine と同じ規則。 */
function parseLine(line: string): { code: string; address: string } | null {
  const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  if (cols.length < 9) return null;

  const code = cols[2];
  if (!/^\d{7}$/.test(code)) return null;

  const pref = cols[6];
  const city = cols[7];
  let town = cols[8];

  town = town.replace(/（.*$/, "").replace(/\(.*$/, "");

  if (
    town.includes("以下に掲載がない場合") ||
    town.includes("次に番地がくる場合") ||
    town === "一円"
  ) {
    town = "";
  }

  const address = `${pref}${city}${town}`;
  return address ? { code, address } : null;
}

const row = (code: string, pref: string, city: string, town: string) =>
  `01101,"060  ","${code}","ｶﾅ","ｶﾅ","ｶﾅ","${pref}","${city}","${town}",0,0,0,0,0,0`;

describe("郵便番号データの読み取り", () => {
  it("ふつうの町域はそのまま繋げる", () => {
    expect(parseLine(row("6018001", "京都府", "京都市南区", "東九条"))).toEqual(
      { code: "6018001", address: "京都府京都市南区東九条" },
    );
  });

  it("「以下に掲載がない場合」は市区町村までにする", () => {
    expect(
      parseLine(
        row("0600000", "北海道", "札幌市中央区", "以下に掲載がない場合"),
      ),
    ).toEqual({ code: "0600000", address: "北海道札幌市中央区" });
  });

  it("括弧の但し書きは外すが、町名は残す（順序の逆転を防ぐ）", () => {
    // ここが逆になると 東京都千代田区 になってしまう。
    expect(
      parseLine(
        row("1000001", "東京都", "千代田区", "千代田（次に番地がくる場合）"),
      ),
    ).toEqual({ code: "1000001", address: "東京都千代田区千代田" });
  });

  it("丁目の但し書きも外す", () => {
    expect(
      parseLine(row("5300001", "大阪府", "大阪市北区", "梅田（１丁目）")),
    ).toEqual({ code: "5300001", address: "大阪府大阪市北区梅田" });
  });

  it("「一円」だけの町域は市区町村までにする", () => {
    expect(
      parseLine(row("9998888", "山形県", "西置賜郡小国町", "一円")),
    ).toEqual({ code: "9998888", address: "山形県西置賜郡小国町" });
  });

  it("郵便番号の形でない行は捨てる", () => {
    expect(
      parseLine(row("60180", "京都府", "京都市南区", "東九条")),
    ).toBeNull();
    expect(parseLine("列が,足りない,行")).toBeNull();
  });
});

describe("取り込みスクリプトの作り", () => {
  const src = readFileSync(
    join(process.cwd(), "scripts", "import_postal_codes.ts"),
    "utf8",
  );

  it("括弧を外してから案内文を判定している（順序が逆だと町名が消える）", () => {
    const stripAt = src.indexOf("town.replace(/（.*$/");
    const noticeAt = src.indexOf('town.includes("以下に掲載がない場合")');
    expect(stripAt).toBeGreaterThan(0);
    expect(noticeAt).toBeGreaterThan(stripAt);
  });

  it("カーソルで前へ進めている（同じ行を読み直して止まらない）", () => {
    // 「座標が無い行」を毎回先頭から取り直すと、引けなかった行が居座る。
    expect(src).toContain("code > $1");
    expect(src).toContain("cursor = row.code");
  });

  it("住所の更新で座標を消していない（2 段目の成果を守る）", () => {
    expect(src).toContain("SET address = EXCLUDED.address");
    expect(src).not.toContain("SET address = EXCLUDED.address, lat = ");
  });
});
