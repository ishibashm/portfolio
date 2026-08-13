import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { GUIDE_PAGES } from "@/lib/guideContent";

/**
 * 築年数上限に、最初から絞り込みが入っていないこと。
 *
 * 以前は `useState<string>("5")` で、開いた時点で「築 5 年以内」に
 * 絞られていた。件数を最も強く絞る条件がこれで、初めて開いた人には
 * 「この地域にはこれだけしか無い」と見える。使い方ガイドにも
 * 「結果が少ないと感じたら築年数上限を空にする（いちばん効きます）」と
 * 書いてあり、**既定が絞り込みになっているのが実態と合っていなかった**。
 *
 * 絞るかどうかは利用者が決める。既定は空（制限なし）。
 *
 * 判定はソースを TypeScript のパーサで読んで useState の初期値を見る。
 * この頁は 4,500 行あり、描画には地図とスキャン API まで巻き込むため。
 */

const PAGE = join(process.cwd(), "src/app/relocation/arbitrage/page.tsx");

/** `const [filterMaxAge, ...] = useState<string>(X)` の X。 */
function initialValue(stateName: string): string {
  const sf = ts.createSourceFile(
    PAGE,
    readFileSync(PAGE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.name.elements.some(
        (el) =>
          ts.isBindingElement(el) &&
          ts.isIdentifier(el.name) &&
          el.name.text === stateName,
      ) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      found = node.initializer.arguments[0]?.getText() ?? "";
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 見つからないなら頁の作りが変わっている。空回りを避けるため落とす。
  expect(found, `${stateName} の useState が見つからない`).toBeDefined();
  return found as string;
}

describe("物件を方位で探す：築年数上限の既定", () => {
  it("既定は空。最初から絞り込まない", () => {
    // 旧実装の '"5"' に戻すとここで落ちる。
    expect(initialValue("filterMaxAge")).toBe('""');
  });

  it("他の絞り込みも既定は空のまま（築年数だけ特別扱いしない）", () => {
    for (const name of [
      "filterMaxRent",
      "filterMinYield",
      "filterMaxStation",
      "filterMinSize",
      "filterMinTotal",
    ]) {
      expect(initialValue(name), name).toBe('""');
    }
  });

  it("使い方ガイドが「最初から5年で絞られている」と書いていない", () => {
    // 実装と案内文が食い違ったまま残るのを防ぐ。#137 と同じ趣旨。
    const text = JSON.stringify(GUIDE_PAGES);
    expect(text).not.toContain("最初から「築5年以内」");
    expect(text).not.toContain("最初から「5」が入っています");
  });
});
