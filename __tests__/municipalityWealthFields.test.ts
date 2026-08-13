import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 総合スコア表の「推奨エリア」が、応答に無い項目を読んでいないこと。
 *
 * `SolarTimeClock.tsx` の wealthData は `any[]` だったため、
 *
 *     {item.topArea.municipality_name_ja}          → undefined（空欄）
 *     {(item.topArea.averageIncome / 10000)}       → NaN（「所得: NaN万円」）
 *
 * と、**どちらも存在しない項目**を読んでいた。`/api/municipalities-wealth`
 * が返すのは Prisma の MunicipalityWealth を展開したものなので、正しくは
 * `areaName` と `incomePerCapita`。any だったので tsc も eslint も
 * 素通りし、画面に出るまで誰も気付けなかった。
 *
 * 型（MunicipalityWealthItem）を付けたので同じ間違いは tsc が止めるが、
 * また any に戻されたときのために、消えた項目名が**実際の参照として**
 * 復活しないことをここでも見ておく。#149・#157 と同じ趣旨。
 *
 * 判定は TypeScript のパーサで PropertyAccessExpression の名前だけを見る。
 * ソースの文字列検索にすると、この経緯を説明したコメント自身を拾う。
 */

const SOURCES = [
  "src/components/SolarTimeClock.tsx",
  "src/app/relocation/wealth/page.tsx",
  "src/components/WealthMap.tsx",
  "src/app/api/municipalities-wealth/route.ts",
];

/** 応答に存在しないのに、過去に読まれていた項目名。 */
const GHOST_FIELDS = ["municipality_name_ja", "averageIncome"];

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

describe("市区町村の所得データ：存在しない項目を読まない", () => {
  it("応答に無い項目名を参照していない", () => {
    for (const rel of SOURCES) {
      const reads = propertyReads(rel);
      for (const field of GHOST_FIELDS) {
        expect(reads.has(field), `${rel} が ${field} を読んでいる`).toBe(false);
      }
    }
  });

  it("正しい項目名を実際に参照している（空回りしていない）", () => {
    const reads = propertyReads("src/components/SolarTimeClock.tsx");
    expect(reads.has("areaName")).toBe(true);
    expect(reads.has("incomePerCapita")).toBe(true);
  });

  it("走査が働いている（パースできていないだけ、ではない）", () => {
    // 名前が 1 つも取れていないなら、上の 2 件は無条件に通ってしまう。
    for (const rel of SOURCES) {
      expect(propertyReads(rel).size, rel).toBeGreaterThan(20);
    }
  });
});
