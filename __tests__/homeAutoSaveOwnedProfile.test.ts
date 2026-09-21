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

  it("旗を立てる所がそろっている（読み込み・入力）", () => {
    const src = readFileSync(join(process.cwd(), SOURCE), "utf8");
    /* 保存値を読んだとき / 欄を直したとき。旧 wealth_* からの引き継ぎは
       2026-09-21 に消した（loadSettings の引き上げが同じ役を担う）。 */
    expect(
      src.match(/setBirthDateOwned\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      src.match(/setBirthPlaceOwned\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
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

  it("旧 wealth_* の写しは読みも書きもしない", () => {
    /*
      以前は「利用者の値のときだけ書く」だった。2026-09-21 に書くのを
      やめた。読む側は loadSettings（引き上げ込み）だけ。
      wealth_presets（控え）は別の話なので、鍵を名指しで見る。
    */
    const src = readFileSync(join(process.cwd(), SOURCE), "utf8");
    const legacy = /"wealth_(birthDate|birthLat|birthLon|baseLat|baseLon)"/;
    expect(src).not.toMatch(legacy);
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
 * 写していた。そちらは object literal ではないので、上の検査に
 * 掛からない。生年月日と出生地は旗で包まれていたのに、**出発地だけ
 * 素通しで書かれていた**（#1100・#1114・#1126 と同じ事故の 4 件目）。
 *
 * 2026-09-21 に**書くのをやめた。**旗で包むより、写しそのものを
 * 無くすほうが穴が残らない。ここでは `setItem` の呼び出しを構文木で
 * 集めて、旧い鍵への書き込みが 1 つも無いことを見る。
 */
describe("旧 wealth_* への直接の書き込み", () => {
  const LEGACY = new Set([
    "wealth_birthDate",
    "wealth_birthLat",
    "wealth_birthLon",
    "wealth_baseLat",
    "wealth_baseLon",
  ]);

  /** `localStorage.setItem("<key>", …)` の呼び出しを全部拾う。 */
  function setItemKeys(source: string): string[] {
    const path = join(process.cwd(), source);
    const sf = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const out: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "setItem" &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        out.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }

  it("見張りが空回りしていない（書き込みを読めている）", () => {
    /* 画面の状態（タブ）は今も直に書いている。それが拾えていれば読めている */
    expect(setItemKeys(SOURCE)).toContain("stc_activeTab");
  });

  it("ホームの時計は旧い鍵に書かない", () => {
    expect(setItemKeys(SOURCE).filter((k) => LEGACY.has(k))).toEqual([]);
  });
});
