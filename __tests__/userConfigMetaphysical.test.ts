import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * 画面の設定をクラウドにも残す件（#407 の DDL で列を足した）。
 *
 * ## 元がどうだったか
 *
 * `MetaphysicalConfigBar` は 5 つの設定を `/api/user-config` へ送っている
 * つもりだったが、**`user_configs` に列が無く `buildPatch` も落としていた**
 * ので黙って消えていた。読むほうも `apiData.use_classical_board` を見て
 * いたが、API は返さないので常に `undefined` だった。
 *
 * つまり**盤の種類・月盤の方式・方位の絞り込み・行動意図・時支の時刻基準は
 * 端末にしか残らず、別の端末では引き継がれなかった。**
 *
 * ## 何を見張るか
 *
 * ルートの中身は DB とセッションが要るので、ここでは**約束が守られて
 * いること**を字面と Prisma の定義で見る。実際の読み書きは手で確かめた。
 */

const ROOT = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("列の定義", () => {
  const schema = read("prisma/schema.prisma");
  const sql = read("prisma/sql/20260819_add_user_config_metaphysical.sql");

  it("schema.prisma に metaphysical_config がある", () => {
    // DDL を当てたあと schema を揃えないと、次の db push で消える。
    expect(schema).toMatch(/metaphysical_config\s+Json\?/);
  });

  it("DDL は足すだけ（二度当てても同じ結果）", () => {
    expect(statements).toContain("ADD COLUMN IF NOT EXISTS");
    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bALTER COLUMN\b/i);
  });

  /** SQL の実行部分だけを取り出す（コメントに書いた語で誤検知しないため）。 */
  const statements = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("既定値を置いていない", () => {
    /*
      DEFAULT を置くと、当てた日に既存の全員が「その設定を選んだ」ことに
      なる。とくに zodiac_time_basis は既定が standard（従来の答え）で
      なければならず、DEFAULT を置くと全利用者の判定が動く。
    */
    expect(statements).not.toMatch(/\bDEFAULT\b/i);
  });
});

describe("API の受け口", () => {
  const route = read("src/app/api/user-config/route.ts");

  it("5 つの設定を受ける", () => {
    for (const key of [
      "use_classical_board",
      "physical_month_mode",
      "direction_filter_mode",
      "action_intent",
      "zodiac_time_basis",
    ]) {
      expect(route, `${key} を受けていない`).toContain(key);
    }
  });

  it("target_date は入れない", () => {
    // 「いつの盤を見るか」は端末ごとの一時的な状態。別の端末に持ち込むと
    // 「昨日の日付で開く」ことになる。
    const picker = route.slice(
      route.indexOf("function pickMetaphysical"),
      route.indexOf("function readMetaphysical"),
    );
    expect(picker).not.toContain("target_date");
  });

  it("丸ごと置き換えず、送られたキーだけ上書きする", () => {
    // 画面ごとに送る項目が違うので、置き換えると別画面の設定を巻き添えで
    // 消す。scalar 側が PATCH 相当なのと同じ理由。
    expect(route).toContain("readMetaphysical(existing.metaphysical_config)");
  });

  it("GET は平らにして返す", () => {
    // 画面側は前から apiData.use_classical_board の形で読んでいる。
    expect(route).toContain("...readMetaphysical(row.metaphysical_config)");
  });
});

describe("画面側", () => {
  const bar = read("src/components/layout/MetaphysicalConfigBar.tsx");

  it("API から来た時刻基準も読む", () => {
    expect(bar).toContain("apiData.zodiac_time_basis");
  });

  it("読むときも normalize を通す", () => {
    // "solar" 以外は標準時に倒す約束を、経路ごとに書き分けない。
    // 折り返しに左右されないよう、空白を潰してから見る。
    const flat = bar.replace(/\s+/g, "");
    expect(flat).toContain(
      "normalizeZodiacTimeBasis(apiData.zodiac_time_basis,)",
    );
  });
});
