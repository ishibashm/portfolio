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
/*
  守る欄。**出発地（base_lat / base_lon）は 2026-09-13 に足した。**
  利用者の報告「愛知県名古屋市が出発地なのに地図は京都」を追って見つけた。
  生年月日と出生地だけ旗で包み、**出発地は素通しで書いていた。**画面は
  計算のために東京駅（35.6895 / 139.6917）を初期値に持つので、保存が走る
  たびにそれが登録内容として他の画面（物件検索など）に渡っていた。
*/
const GUARDED = [
  "birth_date",
  "birth_lat",
  "birth_lon",
  "base_lat",
  "base_lon",
];

function autoSavePayloadProperties(
  source: string = SOURCE,
  variableName = "partialConfig",
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
      node.name.text === variableName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!found)
    throw new Error(`${variableName} の object literal が見つからない`);
  return found;
}

describe("ホームの自動保存", () => {
  const literal = autoSavePayloadProperties();

  it("見張りが空回りしていない（保存する項目を読めている）", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    /* 盤の設定は今までどおり無条件に書く。**出発地はここに置かない**
       （2026-09-13 から旗で包んだので、素の欄として現れたら回帰） */
    expect(names).toContain("use_classical_board");
    expect(names).toContain("layer_mode");
  });

  it("生年月日・出生地・出発地を無条件には書かない", () => {
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
 * 手動保存（プロフィールの「保存」→ `handleSaveConfig` の `configToSave`）
 * も同じ穴があった。#1100 で自動保存だけを守り、こちらは素通りのまま。
 * 生年月日を入れずに体調の基準値だけ保存した人の birth_date に
 * 2000-01-01、出生地に東京駅が書かれ、旧 wealth_birthDate にも同じ値が
 * 入って相場マップがそれを「登録済み」として読んでいた。
 */
describe("ホームの手動保存", () => {
  const literal = autoSavePayloadProperties(SOURCE, "configToSave");

  it("見張りが空回りしていない（保存する項目を読めている）", () => {
    const names = literal.properties
      .filter(ts.isPropertyAssignment)
      .map((p) => p.name.getText());
    expect(names).toContain("baseline_hrv_mean");
    expect(names).toContain("void_zodiac_override");
  });

  it("生年月日・出生地・出発地を無条件には書かない", () => {
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

  it("旧 wealth_birthDate / wealth_birthLat も無条件には書かない", () => {
    const src = readFileSync(join(process.cwd(), SOURCE), "utf8");
    expect(src).not.toMatch(/^\s*localStorage\.setItem\("wealth_birthDate"/m);
    expect(src).toMatch(
      /if \(birthDateOwned\) localStorage\.setItem\("wealth_birthDate"/,
    );
    expect(src).toMatch(
      /if \(birthPlaceOwned\) \{\s*localStorage\.setItem\("wealth_birthLat"/,
    );
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

/**
 * **object literal の外にも同じ穴があった**（2026-09-19）。
 *
 * 上の 2 つは保存に渡す object literal（`partialConfig` /
 * `configToSave`）を見ている。だが `SolarTimeClock` は保存のあとで、
 * 旧 `wealth_*` の鍵へ **localStorage.setItem を直に呼んで**同じ値を
 * 写している。そちらは object literal ではないので、上の検査に
 * 掛からない。
 *
 * 実際、生年月日と出生地は旗で包まれていたのに、**出発地だけ素通しで
 * 書かれていた。**相場マップは `tactical_config_v1` に出発地が無いとき
 * この鍵を読むので、出発地を入れていない人の地図が画面の初期値
 * （東京駅 35.6895 / 139.6917）を基準に出ていた。#1100・#1114・#1126 と
 * 同じ事故の 4 件目。
 *
 * ここでは**呼び出しが旗の `if` の内側にあるか**を構文木で見る。
 * 字面だと、この説明の中の「basePlaceOwned」を拾ってしまう。
 */
describe("旧 wealth_* への直接の書き込み", () => {
  /** 鍵 → その値を書いてよい条件の旗。 */
  const FLAG_FOR: Record<string, string> = {
    wealth_birthDate: "birthDateOwned",
    wealth_birthLat: "birthPlaceOwned",
    wealth_birthLon: "birthPlaceOwned",
    wealth_baseLat: "basePlaceOwned",
    wealth_baseLon: "basePlaceOwned",
  };

  /** `localStorage.setItem("<key>", …)` の呼び出しを全部拾う。 */
  function setItemCalls(source: string): { key: string; node: ts.Node }[] {
    const path = join(process.cwd(), source);
    const sf = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const out: { key: string; node: ts.Node }[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "setItem" &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        out.push({ key: node.arguments[0].text, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  /** その呼び出しを囲む if の条件を、根まで辿って連結する。 */
  function enclosingConditions(node: ts.Node): string {
    const parts: string[] = [];
    let cur: ts.Node | undefined = node.parent;
    while (cur) {
      if (ts.isIfStatement(cur)) parts.push(cur.expression.getText());
      cur = cur.parent;
    }
    return parts.join(" && ");
  }

  const calls = setItemCalls(SOURCE);

  it("見張りが空回りしていない（書き込みを読めている）", () => {
    const keys = calls.map((c) => c.key);
    for (const key of Object.keys(FLAG_FOR)) {
      expect(keys, `${key} への書き込みが見つからない`).toContain(key);
    }
  });

  it("個人の値は、利用者が入れたときだけ書く", () => {
    for (const { key, node } of calls) {
      const flag = FLAG_FOR[key];
      if (!flag) continue;
      expect(
        enclosingConditions(node),
        `${key} を ${flag} の外で書いている（画面の初期値が入る）`,
      ).toContain(flag);
    }
  });
});
