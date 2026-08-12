import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 一覧を出したあと、絞込の画面に戻れること。
 *
 * 一覧⇄絞込の切り替えボタンは「表示範囲内が 100 件以下」という条件の
 * 中に丸ごと入っていた。100 件以下は**一覧を出せるか**の条件であって、
 * 戻れるかの条件ではない。一覧を出したまま地図を動かして範囲が
 * 100 件を超えると、ボタンが「※100件以下で一覧表示可能」という
 * 注意書きに差し替わり、絞込へ帰る手段が画面から消えていた
 * （利用者から「一覧を表示した後に条件を指定する表示に戻れない」
 * として報告。実際に 500 件の範囲で再現している）。
 *
 * 画面全体を描いて確かめたいところだが、この頁は 4,500 行あり
 * 地図・スキャン API・保存設定まで巻き込むため、判定式そのものを
 * ソースから読んで固定する。文字列の一致ではなく、TypeScript の
 * パーサで「『絞込に戻る』を出す三項演算子」を特定し、その条件が
 * 件数だけを見ていないことを見る。書き方を変えても壊れない。
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

describe("物件を方位で探す：一覧から絞込に戻れる", () => {
  it("切り替えボタンの条件が件数だけを見ていない", () => {
    const condition = toggleCondition();
    expect(
      condition.includes("showListView"),
      `一覧表示中かどうかを見ていない: ${condition}`,
    ).toBe(true);
  });

  it("一覧表示中は件数にかかわらずボタンが出る", () => {
    // 条件式を実際に評価する。旧実装（件数だけ）ならここで落ちる。
    const condition = toggleCondition();
    const evaluate = (showListView: boolean, count: number) =>
      Function(
        "showListView",
        "propertiesInBounds",
        `return Boolean(${condition});`,
      )(showListView, { length: count });

    // 報告された状況：一覧を見ている最中に 500 件へ増えた。
    expect(evaluate(true, 500), "一覧表示中に戻れない").toBe(true);
    expect(evaluate(true, 10)).toBe(true);

    // 絞込の画面では、今まで通り 100 件以下でだけ一覧に入れる。
    expect(evaluate(false, 100)).toBe(true);
    expect(evaluate(false, 101)).toBe(false);
  });
});
