/**
 * 物件検索の方位別の家賃・空き家率の札（`HousingStatsByDirection`）は、
 * 賃貸・購入のどちらの切り替えでも出る。
 *
 * #1199 で置いたときは `listingType === "buy" && (…)` の中に入れて
 * いて、賃貸を選んだ人には借家の家賃の統計が見えなかった（借家の
 * 統計なのに購入の側にしか無い）。字面ではなく JSX の木で、札が
 * `listingType` を条件にした `&&` の内側に無いことを見る。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PAGE = join(process.cwd(), "src/app/relocation/arbitrage/page.tsx");

function tagName(node: ts.Node): string | null {
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  return null;
}

function listingTypeGuards(node: ts.Node): string[] {
  const found: string[] = [];
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      p.left.getText().includes("listingType")
    ) {
      found.push(p.left.getText());
    }
    if (
      ts.isConditionalExpression(p) &&
      p.condition.getText().includes("listingType")
    ) {
      found.push(p.condition.getText());
    }
  }
  return found;
}

describe("HousingStatsByDirection は賃貸・購入のどちらでも出る", () => {
  const sf = ts.createSourceFile(
    PAGE,
    readFileSync(PAGE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const mounts: ts.Node[] = [];
  const walk = (n: ts.Node) => {
    if (tagName(n) === "HousingStatsByDirection") mounts.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  it("札が 1 か所に置かれている", () => {
    expect(mounts).toHaveLength(1);
  });

  it("listingType を条件にした分岐の内側に無い", () => {
    expect(listingTypeGuards(mounts[0])).toEqual([]);
  });

  it("購入だけの札（TransactionsPanel）は分岐の内側にある（検査が空回りしていない）", () => {
    const tx: ts.Node[] = [];
    const w = (n: ts.Node) => {
      if (tagName(n) === "TransactionsPanel") tx.push(n);
      ts.forEachChild(n, w);
    };
    w(sf);
    expect(tx).toHaveLength(1);
    expect(listingTypeGuards(tx[0])).toEqual(['listingType === "buy"']);
  });
});
