import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORMER_BIRTH_DATE,
  FORMER_BIRTH_DATETIME,
  FORMER_BIRTH_LAT,
  FORMER_BIRTH_LON,
  stringLiteralsContaining,
} from "./helpers/formerDefaults";

/**
 * 物件スキャナーが、入力していない人に他人の命式で判定を出さないこと。
 *
 * 以前は運営者の生年月日と出生地が既定値として入っていた。本命殺・
 * 本命的殺・天中殺はここから決まるので、生年月日を一度も入れていない
 * 人にも判定が出ていた。本番で実測した状態:
 *
 *   入力欄に生年月日が入っている          ← 一度も入力していない
 *   「方位の吉凶で塗り分けます」は出ない  ← 判定は止まっていない
 *   「三盤吉」が出ている                  ← 本命星を使った判定が出ている
 *
 * 未入力を検知する仕組みはあったが、
 *
 *   const canJudgeDirections = Boolean(hasBaseLocation && birthDate && targetDate);
 *   if (!birthDate) missing.push("生年月日");
 *
 * 既定値が入っているぶん !birthDate が永久に偽で、発火しなかった。
 * 出発地の座標を空のままにしているのと同じ理由（設定していない人が
 * 「自分の吉方位」だと思ってしまう）で、生年月日も空にする。
 *
 * #166 でシミュレータの同じ形を直している。これはスキャナー本体の分。
 *
 * ここはソースを読んで見ている。8,000 行のクライアント component で、
 * 描画して初期 state を確かめるのが現実的でないため。
 */

const PAGE = join(
  process.cwd(),
  "src",
  "app",
  "relocation",
  "arbitrage",
  "page.tsx",
);
const src = readFileSync(PAGE, "utf8").split("\r\n").join("\n");

/**
 * 「引っ越し時期を探す」は /relocation/timing へ移管した（#603）。
 * 走査が無効な理由（生年月日の未入力）を出すのはそちらになったので、
 * この 1 件だけ時期分析の頁を読む。
 */
const TIMING_PAGE = join(
  process.cwd(),
  "src",
  "app",
  "relocation",
  "timing",
  "page.tsx",
);
const timingSrc = readFileSync(TIMING_PAGE, "utf8").split("\r\n").join("\n");

describe("方位で街を探す頁の既定値", () => {
  it("ページを読めている（空回りしていない）", () => {
    expect(src.length).toBeGreaterThan(10000);
    expect(src).toContain("canJudgeDirections");
  });

  it("生年月日と出発地に既定値を置いていない", () => {
    /* 2026-09-20 の組み替えで、初期状態は 1 つの object（readInitialState）
       になった。生年月日・出発地はそこで空にしておく。ここに日付や座標を
       置くと、入れていない人にも判定が出る。 */
    expect(src).toContain("const state: PageState = {");
    expect(src).toMatch(
      /const state: PageState = \{\s*birthDate: "",\s*baseLat: "",\s*baseLon: "",/,
    );
  });

  it("運営者の生年月日が値として残っていない", () => {
    // 文字列リテラルとして出てこないこと。経緯を書いたコメントは
    // 引用符の外にあるので当たらない。
    expect(stringLiteralsContaining(src, FORMER_BIRTH_DATE)).toEqual([]);
    expect(src).not.toContain(FORMER_BIRTH_DATETIME);
    expect(src).not.toContain(FORMER_BIRTH_LAT);
    expect(src).not.toContain(FORMER_BIRTH_LON);
  });

  it("未入力を検知する側は触っていない", () => {
    // 既定値を外しただけで、判定を出す条件そのものは変えていない。
    expect(src).toContain("hasBaseLocation && birthDate && targetDate");
    expect(src).toContain('if (!birthDate) missing.push("生年月日");');
  });

  it("出発地は利用者が入れたときだけ保存に流す", () => {
    /* 画面の初期値を保存に流さない（CLAUDE.md 3 節。#1100・#1114・#1126）。
       出発地を書くのは setBase（PlaceInput・現在地）の中だけ。 */
    const writes = src.match(/savePlacePoint\("base"/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(src).toContain("const setBase = useCallback(");
  });

  it("座標を直に書かない（地名が置き去りになる）", () => {
    /*
      以前はここが `saveSettings({ base_lat, base_lon })` だった。座標だけ
      書くと、前に登録した地名（`base_label`）がそのまま残り、**同じ画面の
      帯が別の街の名前を出し続ける**（`lib/placePoint` の冒頭に経緯）。
      名前ごと扱う口を通すこと。
    */
    expect(src).not.toMatch(/saveSettings\(\{\s*base_l(at|on)/);
    expect(src).toContain('savePlacePoint("base", lat, lon, name)');
  });

  it("setBase が地名を受け取る（第 3 引数を落とさない）", () => {
    /*
      `PlaceInput` の props は `onChange(lat, lon, name?)`。name を受け口に
      書いていないと、型は通るのに地名だけ静かに捨てられる。
    */
    expect(src).toMatch(
      /const setBase = useCallback\(\s*\(lat: number, lon: number, name\?: string\) =>/,
    );
  });

  it("走査が無効な理由に生年月日が入っている（移管先の時期分析）", () => {
    // 以前は出発地の分しか無く、生年月日だけ未入力だとボタンが灰色の
    // まま理由が読めなかった（#160）。移管後は時期分析の頁が
    // canScan と missingLabel で同じ役割を持つ。
    expect(timingSrc.length).toBeGreaterThan(1000);
    expect(timingSrc).toContain(
      "Boolean(settings?.baseLon && settings?.birthDate)",
    );
    expect(timingSrc).toContain('settings?.birthDate ? null : "生年月日"');
  });
});
