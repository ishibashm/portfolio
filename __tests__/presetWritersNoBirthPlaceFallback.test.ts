import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 控え（ProfilePreset）を書く側が、**入れていない出生地を既定値で
 * 埋めないこと。**
 *
 * 型が必須だったころ、ホームの簡易プロフィールは空なら東京駅で、設定
 * バーは現住地で埋めていた。控えを呼び出すとその座標が birth_lat として
 * クラウドに書かれ、サイト全体が「出生地を登録済み」として読み、
 * 物件検索と移住先の比較が東京または現住地で生まれた人として天体ライン
 * の加点を付けていた。利用者の判断（2026-09-11）:「出生地未入力の場合、
 * 天体ラインを出さない」。
 *
 * 見るのは**object literal の形**（homeAutoSaveOwnedProfile と同じ）。
 * `birthLat: x ?? y` のように `??` で埋める初期化子があれば落とす。字面で
 * 見るとこの経緯を書いたコメントを拾うので AST で見る。
 */
const WRITERS = [
  "src/components/home/QuickProfileBar.tsx",
  "src/components/layout/MetaphysicalConfigBar.tsx",
];
const GUARDED = new Set(["birthLat", "birthLon"]);

function coalescedBirthProps(source: string): string[] {
  const path = join(process.cwd(), source);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      GUARDED.has(node.name.text) &&
      ts.isBinaryExpression(node.initializer) &&
      node.initializer.operatorToken.kind ===
        ts.SyntaxKind.QuestionQuestionToken
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      hits.push(`${source}:${line + 1} ${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("控えを書く側は、入れていない出生地を既定値で埋めない", () => {
  for (const source of WRITERS) {
    it(`${source} に birthLat/birthLon の ?? 埋めが無い`, () => {
      expect(coalescedBirthProps(source)).toEqual([]);
    });
  }

  it("ホームの案内は「東京で計算します」ではなく、加点を付けないことを言う", () => {
    const page = readFileSync(join(process.cwd(), WRITERS[0]), "utf8");
    expect(page).not.toContain("（東京）で計算します");
    expect(page).toContain("天体ライン（太陽・金星・木星）の加点を付けずに");
  });

  it("見張りが空回りしていない（?? 埋めがあれば拾う）", () => {
    /* 実ファイルではなく、その場で組んだ断片に同じ visitor を当てる */
    const sf = ts.createSourceFile(
      "x.tsx",
      "const v = { birthLat: a ?? 35.6895, birthLon: b ?? 139.6917 };",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let n = 0;
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        GUARDED.has(node.name.text) &&
        ts.isBinaryExpression(node.initializer) &&
        node.initializer.operatorToken.kind ===
          ts.SyntaxKind.QuestionQuestionToken
      )
        n++;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(n).toBe(2);
  });
});
