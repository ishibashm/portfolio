import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 物件の応答に無い項目を読んでいないこと。
 *
 * 総合スコアの「推奨賃貸物件 TOP 5」が
 *
 *     築年数: {rental.age_years}年     → 「築年数: 年」（空欄）
 *
 * と、**存在しない項目**を読んでいた。`/api/rentals/arbitrage` は
 * `SELECT *` に計算した列を足して返すので、出るのは rental_properties の
 * 列名そのまま（`building_age`）で、`age_years` という別名は無い。
 * `propertiesData` が `any[]` だったので tsc も eslint も素通りした。
 *
 * 市区町村の所得データで起きたのと同じ形（#231）。あちらと同じく、型を
 * 付けたので同じ間違いは tsc が止めるが、また any に戻されたときのために
 * **実際の参照として**復活しないことをここでも見る。
 *
 * 判定は TypeScript のパーサで PropertyAccessExpression の名前だけを見る。
 * ソースの文字列検索にすると、この経緯を説明したコメント自身を拾う。
 */

/**
 * 応答を読んでいる側。`lib/scoredProperty.ts` は型の宣言だけで
 * プロパティ参照を持たないので、ここには入れない（走査の対象にすると
 * 常に 0 件になり、下の健全性チェックが意味を失う）。型の側は tsc が守る。
 */
const SOURCES = [
  "src/components/SolarTimeClock.tsx",
  "src/components/ArbitrageMapInner.tsx",
  "src/app/relocation/arbitrage/page.tsx",
];

/** 応答に存在しないのに、過去に読まれていた項目名。 */
const GHOST_FIELDS = ["age_years"];

/** そのファイルが `x.name` の形で参照している名前の一覧。 */
function propertyReads(rel: string): Set<string> {
  const path = join(process.cwd(), rel);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

describe("物件データ：存在しない項目を読まない", () => {
  it("応答に無い項目名を参照していない", () => {
    for (const rel of SOURCES) {
      const reads = propertyReads(rel);
      for (const field of GHOST_FIELDS) {
        expect(reads.has(field), `${rel} が ${field} を読んでいる`).toBe(false);
      }
    }
  });

  it("築年数は building_age を参照している（空回りしていない）", () => {
    const reads = propertyReads("src/components/SolarTimeClock.tsx");
    expect(reads.has("building_age")).toBe(true);
  });

  it("走査が働いている（パースできていないだけ、ではない）", () => {
    for (const rel of SOURCES) {
      expect(propertyReads(rel).size, rel).toBeGreaterThan(3);
    }
  });
});
