import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * ホームの自動保存が、**利用者が入れていない生年月日・出生地を
 * 書き込まないこと。**
 *
 * `SolarTimeClock` は生年月日の初期値に "2000-01-01T00:00"、出生地に
 * 東京の座標を持つ。画面では「仮の値で計算した結果です」と断って
 * 出しているが、自動保存はその値を tactical_config_v1 へ**そのまま
 * 書いていた。**切り替えを 1 つ触るだけで書き込みが走る。
 *
 * 一度書かれると、他の画面（物件検索・シミュレータ・暦・/profile・
 * /account）はそれを「登録済み」として読む。**架空の生年月日が
 * サイト全体の登録内容になる。**断りの文言も消える（生年月日が
 * 入っている扱いになるため）。
 *
 * api/municipalities-wealth で同じことが起きて #1033 で直した。
 * こちらは画面側の同じ穴。
 *
 * 判定は TypeScript のパーサで**自動保存に渡す object literal の形**を
 * 見る（municipalityWealthFields.test.ts と同じやり方）。字面で見ると、
 * この経緯を説明したコメント自身を拾ってしまう。
 */

const SOURCE = "src/components/SolarTimeClock.tsx";
/** 相場マップ。こちらは**空文字**を書いてクラウドの値を消していた。 */
const WEALTH = "src/app/relocation/wealth/page.tsx";
const GUARDED = ["birth_date", "birth_lat", "birth_lon"];

function autoSavePayloadProperties(
  source: string = SOURCE,
): ts.ObjectLiteralExpression {
  const path = join(process.cwd(), source);
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "partialConfig" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!found) throw new Error("partialConfig の object literal が見つからない");
  return found;
}

describe("ホームの自動保存", () => {
  const literal = autoSavePayloadProperties();

  it("見張りが空回りしていない（保存する項目を読めている）", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    /* 盤の設定や出発地は今までどおり無条件に書く */
    expect(names).toContain("base_lat");
    expect(names).toContain("use_classical_board");
  });

  it("生年月日と出生地を無条件には書かない", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    for (const key of GUARDED) {
      expect(names, key).not.toContain(key);
    }
  });

  it("利用者の値のときだけ書く（条件つきの展開になっている）", () => {
    const spreads = literal.properties.filter(ts.isSpreadAssignment);
    const text = spreads.map((s) => s.expression.getText()).join("\n");
    expect(text).toContain("birthDateOwned");
    expect(text).toContain("birthPlaceOwned");
    for (const key of GUARDED) expect(text, key).toContain(key);
  });

  it("旗を立てる所がそろっている（読み込み・引き継ぎ・入力）", () => {
    const src = readFileSync(join(process.cwd(), SOURCE), "utf8");
    /* 保存値を読んだとき / 旧 wealth_* から引き継いだとき / 欄を直したとき */
    expect(
      src.match(/setBirthDateOwned\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(
      src.match(/setBirthPlaceOwned\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });
});

/**
 * 相場マップ（/relocation/wealth）は state が空文字から始まり、
 * 読み込みは localStorage しか見ない。ログイン中の利用者が別の端末から
 * 来てこの頁を先に開くと、GPS や日付の変更で保存が走った時点で
 * `birth_date: ""` をクラウドへ送り、**登録済みの生年月日を消していた。**
 *
 * 座標は元から空を落としていた（`? : undefined`）。生年月日だけが
 * 素通りしていた。
 */
describe("相場マップの保存", () => {
  const literal = autoSavePayloadProperties(WEALTH);

  it("見張りが空回りしていない（保存する項目を読めている）", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    expect(names).toContain("layer_mode");
    expect(names).toContain("use_true_north");
  });

  it("空の生年月日を書かない", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    expect(names).not.toContain("birth_date");

    const spreads = literal.properties
      .filter(ts.isSpreadAssignment)
      .map((s) => s.expression.getText())
      .join("\n");
    expect(spreads).toContain("birth_date");
    expect(spreads).toContain("currentBirthDate");
  });

  it("座標は今までどおり空を落としている", () => {
    const text = literal.getText();
    expect(text).toContain("currentBirthLat ? parseFloat(currentBirthLat)");
    expect(text).toContain("currentBaseLat ? parseFloat(currentBaseLat)");
  });
});
