import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { getCurrentZodiac } from "@/utils/ephemerisEngine";

/**
 * 設定した時刻基準が**実際に判定まで届いている**ことを見張る。
 *
 * #404 でエンジンに口を開け、#405 で設定を持てるようにした。だが
 * **その 2 つが繋がっていなければ、切り替えても何も起きない。**
 * 本命星が届いていなかった件（#403）と同じ形の事故になる。
 *
 * 振る舞いで固定できない（部品の中の呼び出しなので）ため、字面で見張る。
 * 見張るのは「第 3 引数を渡しているか」だけで、値の正しさは
 * `zodiacTimeBasis.test.ts` が別に見ている。
 */

const ROOT = process.cwd();

/** 設定が届くべき呼び出し元。ここに足すときは理由も一緒に書くこと。 */
const WIRED = [
  "src/components/SolarTimeClock.tsx",
  "src/components/SolarTimeTable.tsx",
  "src/app/api/nba/route.ts",
  "src/app/api/nba/forecast/route.ts",
];

/**
 * `getCurrentZodiac(...)` の引数を、括弧の対応を取りながら数える。
 *
 * 正規表現だと `new Date(s)` の内側の `)` で切れてしまい、
 * 「引数が足りない」と誤検知する（実際に 1 度やった）。
 */
function callsWithoutBasis(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const found: string[] = [];
  const needle = "getCurrentZodiac(";
  let from = 0;

  for (;;) {
    const at = code.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;

    let depth = 1;
    let commas = 0;
    let i = from;
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 1) commas++;
    }
    if (depth !== 0) continue; // 閉じていない＝読み取れないので飛ばす

    if (commas < 2) found.push(code.slice(at, i));
  }

  return found;
}

describe("時刻基準の配線", () => {
  for (const file of WIRED) {
    it(`${file}: getCurrentZodiac に時刻基準を渡している`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(
        callsWithoutBasis(source),
        "第 3 引数を渡していない呼び出しが残っている。" +
          "設定を切り替えてもここだけ標準時のままになる",
      ).toEqual([]);
    });
  }

  it("この見張り方そのものが効くこと（空回りしていないこと）", () => {
    // 渡していない書き方を拾えること。
    expect(
      callsWithoutBasis("const z = getCurrentZodiac(d, lon);"),
    ).toHaveLength(1);
    // 渡している書き方は拾わないこと。
    expect(
      callsWithoutBasis("const z = getCurrentZodiac(d, lon, basis);"),
    ).toEqual([]);
    // 入れ子の括弧があっても数を間違えないこと。
    expect(
      callsWithoutBasis("getCurrentZodiac(new Date(s), lon || 139.6, basis);"),
    ).toEqual([]);
  });
});

describe("エンジン側の既定は標準時のまま", () => {
  it("第 3 引数を省いた呼び出しは従来どおり経度を見ない", () => {
    // 配線が済んでいない残りの呼び出し元（API・utils）は、この既定に
    // 頼って従来の答えを返し続ける。ここが崩れると黙って全部動く。
    const t = new Date("2026-08-18T14:58:00+09:00");
    const answers = new Set(
      [127.68, 135.0, 145.58].map((lon) => getCurrentZodiac(t, lon).hourZodiac),
    );
    expect(answers.size).toBe(1);
  });
});

/**
 * API 側は**画面から来た値をそのまま信じない。**
 *
 * 既定は標準時（従来の答え）で、`"solar"` のときだけ切り替える。
 * ここが `clientBody.zodiacTimeBasis` の素通しになると、壊れた値や
 * 古い版の画面から来た値で判定が動く。
 */
const API_ROUTES = [
  "src/app/api/nba/route.ts",
  "src/app/api/nba/forecast/route.ts",
];

describe("API が受け取るときの倒し方", () => {
  for (const file of API_ROUTES) {
    it(`${file}: "solar" 以外は標準時に倒す`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      const flat = source.replace(/\s+/g, "");
      expect(
        flat,
        "画面から来た値を素通ししている。既定は標準時でなければならない",
      ).toContain('clientBody.zodiacTimeBasis==="solar"?"solar":"standard"');
    });
  }
});
