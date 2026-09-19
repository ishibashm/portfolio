import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  DIRECTION_FILTER_MODES,
  parseDirectionFilterMode,
} from "@/utils/directionFilterMode";

/**
 * 目的地タブの「観点」ボタンが書く id が、**他の頁が読める id** であること。
 *
 * ## 何が起きていたか
 *
 * 組み合わせの 3 つ（吉凶+環境／吉凶+天中殺／天中殺+環境）が
 * `kigaku_env` / `kigaku_bazi` / `bazi_env` という**古い id** を書いていた。
 * ダッシュボードの中では `includes("kigaku")` のような部分一致で層を
 * 決めているので動く。しかしこの値は `direction_filter_mode` として
 * **保存され、クラウドに同期される。**読む側（MetaphysicalConfigBar・
 * 物件検索・timing・history / export の API）は `parseDirectionFilterMode`
 * を通し、知らない値は**黙って「総合判定」に倒す**（MetaphysicalConfigBar
 * のテストがまさに `kigaku_env` を legacy の例にしている）。
 *
 * ダッシュボードで「吉凶+環境」を選んだ人が、他の頁では総合判定で
 * 見ていた。**同じ設定なのに頁によって判定が違う**、という食い違い。
 *
 * ## 見張り方
 *
 * 字面（grep）では、この経緯を書いたコメント自身を拾う。TypeScript の
 * パーサで**`setDirectionFilterMode(...)` に渡す文字列**と、
 * **`directionFilterMode === "..."` で比べる文字列**を集め、どれも
 * `DIRECTION_FILTER_MODES` か表示だけの重ね札（下）であることを見る。
 *
 * `optimal_only` / `exclude_noise` は**見方ではなく表示の重ね札**
 * （大吉を強調する／大凶を灰色にする）で、ダッシュボードの中だけの
 * もの。他の頁が総合判定に倒すのは意図どおり。ここでは許す。
 */

const SOURCE = "src/components/home/DestinationMapPanel.tsx";

/** 表示だけの重ね札。見方（DirectionFilterMode）ではない。 */
const DISPLAY_OVERLAYS = ["optimal_only", "exclude_noise"] as const;

const ALLOWED = new Set<string>([
  ...DIRECTION_FILTER_MODES,
  ...DISPLAY_OVERLAYS,
]);

interface Found {
  /** ボタンが書く値 */
  written: Set<string>;
  /** `directionFilterMode === "..."` で比べている値 */
  compared: Set<string>;
}

function collect(): Found {
  const path = join(process.cwd(), SOURCE);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const written = new Set<string>();
  const compared = new Set<string>();

  /* 式の中の文字列リテラルを全部拾う（`prev === "a" ? "b" : "c"` も含む） */
  const literalsIn = (node: ts.Node, out: Set<string>) => {
    if (ts.isStringLiteral(node)) out.add(node.text);
    ts.forEachChild(node, (c) => literalsIn(c, out));
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "setDirectionFilterMode"
    ) {
      for (const arg of node.arguments) literalsIn(arg, written);
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
    ) {
      const sides = [node.left, node.right];
      const hasMode = sides.some(
        (s) => ts.isIdentifier(s) && s.text === "directionFilterMode",
      );
      if (hasMode) {
        for (const s of sides) if (ts.isStringLiteral(s)) compared.add(s.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { written, compared };
}

describe("目的地タブの観点ボタンが書く id", () => {
  const { written, compared } = collect();

  it("読めている（この検査自体が空回りしていない）", () => {
    /* 7 つの見方 + 重ね札 2 つ。ボタンが減ったらここで気付く */
    expect(written.size).toBeGreaterThanOrEqual(7);
    expect(compared.size).toBeGreaterThanOrEqual(7);
  });

  it("書く値はどれも、他の頁が読める id か表示の重ね札", () => {
    for (const v of written) {
      expect(ALLOWED.has(v), `書いている "${v}" は誰も読めない`).toBe(true);
    }
  });

  it("比べる値も同じ集合の中にある（古い id で比べると押しても光らない）", () => {
    for (const v of compared) {
      expect(ALLOWED.has(v), `"${v}" と比べているが、その値は来ない`).toBe(
        true,
      );
    }
  });

  it("7 つの見方をすべて選べる", () => {
    for (const mode of DIRECTION_FILTER_MODES) {
      expect(written.has(mode), `${mode} を書くボタンが無い`).toBe(true);
    }
  });

  it("書いた見方は、読む側でそのまま同じ見方に戻る（総合判定に倒れない）", () => {
    for (const v of written) {
      if ((DISPLAY_OVERLAYS as readonly string[]).includes(v)) continue;
      expect(parseDirectionFilterMode(v)).toBe(v);
    }
  });
});
