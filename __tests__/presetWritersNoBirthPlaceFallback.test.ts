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

/**
 * ホームのプロフィール設定は `??` ではなく、SolarTimeClock の state
 * （初期値が東京駅）を**省略記法 `birthLat,` でそのまま**控えに入れて
 * いた。こちらは object literal に birthLat / birthLon の省略記法が
 * あれば落とす。正しい形は `...(birthPlaceOwned ? { birthLat, birthLon } : {})`
 * で、これは spread なので拾わない。
 */
const OWNED_WRITER = "src/components/PersonalProfileConfig.tsx";

function shorthandBirthProps(source: string): string[] {
  const path = join(process.cwd(), source);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hits: string[] = [];
  /* `...(birthPlaceOwned ? { birthLat, birthLon } : {})` の中の省略記法は
     正しい形なので許す。条件が birthPlaceOwned で、その真の側の object
     literal に居るものだけ */
  const isOwnedGuarded = (node: ts.Node): boolean => {
    const literal = node.parent;
    const cond = literal?.parent;
    return (
      !!literal &&
      ts.isObjectLiteralExpression(literal) &&
      !!cond &&
      ts.isConditionalExpression(cond) &&
      cond.whenTrue === literal &&
      cond.condition.getText(sf) === "birthPlaceOwned"
    );
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isShorthandPropertyAssignment(node) &&
      GUARDED.has(node.name.text) &&
      !isOwnedGuarded(node)
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
  it(`${OWNED_WRITER} は控えを書かない（切り替えは ProfilePicker、書くのは lib/activeProfile）`, () => {
    /* 以前はここが控えの新規保存・更新を持ち、birthPlaceOwned で条件付きに
       出生地を入れていた。2026-09-12 に保存の口を lib/activeProfile に
       一本化し、この部品は書かなくなった。書く口が戻ってきたら落とす */
    expect(shorthandBirthProps(OWNED_WRITER)).toEqual([]);
    const page = readFileSync(join(process.cwd(), OWNED_WRITER), "utf8");
    expect(page).not.toContain("saveProfilePresets(");
    expect(page).toContain("<ProfilePicker");
  });

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
