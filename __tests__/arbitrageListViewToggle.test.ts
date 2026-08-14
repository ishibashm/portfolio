import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 一覧⇄絞込の切り替えが、件数にかかわらずいつでもできること。
 *
 * 経緯は 2 段ある。最初、切り替えボタンは「表示範囲内が 100 件以下」
 * という条件の中に丸ごと入っていて、一覧を出したまま件数が増えると
 * 絞込へ帰る手段が画面から消えていた。次に「一覧表示中は戻れる」に
 * 直したが、100 件を超えると一覧に**入れない**制限は残っていた。
 * 数百件でも問題なく表示できることを利用者が確認したので、制限ごと
 * 外した（候補はもともと 500 件が上限なので際限なく増えない）。
 *
 * ここで固定するのは「切り替えを件数で縛らない」こと。ボタンの
 * ラベルを出し分ける三項演算子（showListView ? 戻る : 表示）を
 * TypeScript のパーサで特定し、その条件が showListView そのもので
 * あること＝外側に件数の条件が無いことを見る。
 */

const PAGE = join(process.cwd(), "src/app/relocation/arbitrage/page.tsx");

/** 「絞込に戻る」を出している三項演算子の、条件部分のソース。 */
function toggleCondition(): string {
  const source = readFileSync(PAGE, "utf8");
  const sf = ts.createSourceFile(
    PAGE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isConditionalExpression(node) &&
      node.whenTrue.getText().includes("絞込に戻る")
    ) {
      // ボタンの中にも `showListView ? "絞込に戻る" : "一覧を表示"` がある。
      // 見たいのは外側（ボタンを出すかどうか）なので、ここで降りるのをやめる。
      found.push(node.condition.getText());
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 見つからないなら、この頁の作りが変わっている。空回りを避けるため落とす。
  expect(found, "「絞込に戻る」を出す三項演算子が見つからない").toHaveLength(1);
  return found[0];
}

describe("物件を方位で探す：一覧⇄絞込の切り替えを件数で縛らない", () => {
  it("切り替えの条件は showListView だけ（件数の条件が無い）", () => {
    // 旧実装（100 件以下でだけ一覧に入れる）に戻すと、外側の三項演算子が
    // 復活してここで捕まる（条件に propertiesInBounds.length が現れる）。
    const condition = toggleCondition();
    expect(condition.trim()).toBe("showListView");
  });

  it("「※100件以下で一覧表示可能」の注意書きが残っていない", () => {
    const source = readFileSync(PAGE, "utf8");
    expect(source).not.toContain("※100件以下で一覧表示可能");
    expect(source).not.toContain("propertiesInBounds.length <= 100");
  });
});
