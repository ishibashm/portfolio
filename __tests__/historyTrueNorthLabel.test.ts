import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 移動履歴（/relocation/history）の画面が、判定を「磁北基準」と書かないこと。
 *
 * 判定は設定に関わらず真北（api/relocation/history の GET の註。保存時の
 * 判定と一覧の再評価が境目で食い違った件で揃えた）。磁北の設定で変わるのは
 * 「方位磁針で測るとどう見えるか」を添えるかどうかだけ。
 *
 * それなのに画面の帯は、設定が磁北のとき「方位偏角: 磁北基準 (磁気偏角補正)」
 * と出していて、判定まで磁北で出しているように読めた（2026-10-05 の監査。
 * #1631 の記事を書いたセッションが気付いて残した件）。
 *
 * 画面に出る文字（JSX の文字と文字列リテラル）を TypeScript のパーサで集めて
 * 見る。字面で見ると、経緯を書いたコメントを拾ってしまう。
 */

const SOURCE = "src/app/relocation/history/page.tsx";

function displayedTexts(): string[] {
  const path = join(process.cwd(), SOURCE);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) out.push(node.getText().trim());
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter(Boolean);
}

describe("移動履歴の画面の基準の表示", () => {
  const texts = displayedTexts();

  it("見張りが空回りしていない（画面の文字を読めている）", () => {
    expect(texts).toContain("移動履歴を追加");
  });

  it("判定を磁北基準とは書かない", () => {
    expect(texts.filter((t) => t.includes("磁北基準"))).toEqual([]);
  });

  it("判定は真北と書き、磁北は方位磁針の見え方として添える", () => {
    expect(texts).toContain("方位の判定:");
    expect(texts).toContain("真北");
    expect(texts).toContain("（方位磁針で測ったときの見え方も添えます）");
  });
});
