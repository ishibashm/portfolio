/**
 * 一覧で物件を選んでも、検索の範囲（地図の表示範囲）を変えない。
 *
 * ## なぜ（利用者の報告、2026-09-12）
 *
 * 「物件を押してみたらその物件の場所に移動して一覧が変わってしまう」。
 *
 * 行を押すと `setMapCenter` で地図が動く → 地図が moveend で新しい
 * 表示範囲を頁へ返す → 一覧は表示範囲で絞り込んでいるので、**押した
 * 瞬間に読んでいた一覧がその物件の周りだけに入れ替わっていた。**
 *
 * 一覧で選ぶ = 強調して詳細を出すこと。地図を動かすのは詳細の
 * 「地図で見る」から、利用者が頼んだときだけ（SUUMO・HOME'S・Zillow と
 * 同じ切り分け）。
 *
 * 字面で見るとコメントや別の行を拾うので、**onClick の式を木で見る。**
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PAGE = join(process.cwd(), "src/app/relocation/arbitrage/page.tsx");
const source = readFileSync(PAGE, "utf8");
const sf = ts.createSourceFile(
  PAGE,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

/** onClick={...} の式を全部集める。 */
function onClickHandlers(): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "onClick" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      out.push({ text: node.initializer.expression.getText(), line: line + 1 });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

describe("一覧で選んでも検索範囲は変わらない", () => {
  const handlers = onClickHandlers();

  it("選択のハンドラ（selectProperty / setSelectedId）が地図を動かさない", () => {
    const guilty = handlers
      .filter(
        (h) =>
          (h.text.includes("selectProperty") ||
            h.text.includes("setSelectedId")) &&
          h.text.includes("setMapCenter"),
      )
      .map((h) => `page.tsx:${h.line}`);
    expect(guilty).toEqual([]);
  });

  it("行の選択は selectProperty を通す（3 か所: TOP5・カード・表）", () => {
    const picks = handlers.filter((h) =>
      h.text.includes("selectProperty(item.id)"),
    );
    expect(picks).toHaveLength(3);
  });

  it("地図へ寄せる口は残っている（詳細の「地図で見る」）", () => {
    expect(source).toContain("地図で見る");
    const show = handlers.filter((h) => h.text.includes("showOnMap("));
    expect(show.length).toBeGreaterThan(0);
  });

  it("showOnMap だけが選択から地図を動かす（中心・面の切り替えを持つ）", () => {
    const body = source.slice(
      source.indexOf("const showOnMap = useCallback("),
      source.indexOf("const propertiesInBounds"),
    );
    expect(body).toContain("setMapCenter(");
    expect(body).toContain('setMobilePane("map")');
  });
});
