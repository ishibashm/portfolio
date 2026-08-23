/**
 * 天中殺（空亡）の当たり判定に使う干支を、盤と同じ時刻で引くこと。
 *
 * `computeDayLayers` は盤（`calculateVectorCollision`）には `instant`
 * ＝「日本時間の正午を出発地の太陽時に直した時刻」を渡しながら、
 * 天中殺の干支だけ `new Date(instant.toISOString().split("T")[0])` と
 * 日付を切り出して渡していた。日付だけの文字列は UTC の 0 時として
 * 解釈されるので、実際に引いていたのは**日本時間 9 時**の干支である。
 *
 * 同じ日・同じ判定の中で干支を 2 か所・別々の時刻で計算していたので、
 * 節入りが 9 時〜正午に来る日だけ月支が 1 つ手前の月のままになる。
 *
 * ここでは旧実装をそのまま写し、
 *
 *   1. 「voidScopes は盤の時刻の干支と一致する」を広い範囲で固定する
 *   2. 新旧が食い違う日を名指しで固定する
 *   3. 旧実装に戻すと 1 も 2 も落ちることを確かめる
 *
 * の 3 つを置く。3 が無いと、直したつもりで何も変えていない可能性が残る。
 */
import { describe, it, expect } from "vitest";
import { judgeDay } from "@/utils/auspiciousDays";
import { getCurrentZodiac } from "@/utils/ephemerisEngine";
import { directionBoardInstant } from "@/utils/boardInstant";
import type { VoidScopes } from "@/utils/tenchusatsuPolicy";

const NAGOYA_LON = 136.9008;

const params = (voidZodiacs: string[]) => ({
  honmeiStar: 3 as const,
  voidZodiacs,
  lon: NAGOYA_LON,
  direction: "SE" as const,
  tenchusatsuMode: "strict" as const,
});

/** 日本時間のその日の正午を指す Date（実行環境のタイムゾーンに依らない）。 */
const jstNoon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));

/** 直す前の実装。日付だけを切り出して渡していた＝日本時間 9 時の干支。 */
function legacyVoidScopes(date: Date, voidZodiacs: string[]): VoidScopes {
  const instant = directionBoardInstant(date, 0, NAGOYA_LON);
  const z = getCurrentZodiac(
    new Date(instant.toISOString().split("T")[0]),
    NAGOYA_LON,
  );
  return {
    year: voidZodiacs.includes(z.yearZodiac),
    month: voidZodiacs.includes(z.monthZodiac),
    day: voidZodiacs.includes(z.dayZodiac),
  };
}

/** 盤が見ている時刻の干支から組んだ voidScopes。これが正。 */
function boardVoidScopes(date: Date, voidZodiacs: string[]): VoidScopes {
  const z = getCurrentZodiac(
    directionBoardInstant(date, 0, NAGOYA_LON),
    NAGOYA_LON,
  );
  return {
    year: voidZodiacs.includes(z.yearZodiac),
    month: voidZodiacs.includes(z.monthZodiac),
    day: voidZodiacs.includes(z.dayZodiac),
  };
}

const ALL_VOID_PAIRS = [
  ["子", "丑"],
  ["寅", "卯"],
  ["辰", "巳"],
  ["午", "未"],
  ["申", "酉"],
  ["戌", "亥"],
];

describe("天中殺の干支は盤と同じ時刻で引く", () => {
  it("2026〜2029 年の全日で、voidScopes が盤の時刻の干支と一致し、差は 8 日だけ", () => {
    // 走査は 1 通り（子丑）で回す。盤の組み立てが 1 日 1 回で済まないと
    // 6 通り × 1461 日で 40 秒かかり、CI の待ち時間に効いてくる。
    // 支の組をまたぐ日は下の名指しの test で 6 通りすべてを見る。
    const PAIR = ["子", "丑"];
    const AFFECTED = new Set([
      "2026-07-07",
      "2026-12-07",
      "2027-02-04",
      "2027-04-05",
      "2028-03-05",
      "2028-09-07",
      "2029-01-05",
      "2029-11-07",
    ]);
    const mismatches: string[] = [];
    const unexpected: string[] = [];
    for (let i = 0; i < 1461; i++) {
      const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
      const key = new Date(d.getTime() + 9 * 3600000)
        .toISOString()
        .slice(0, 10);

      const got = judgeDay(d, params(PAIR)).voidScopes;

      // 1. 盤が見ている時刻の干支と一致すること。
      const want = boardVoidScopes(d, PAIR);
      if (
        got.year !== want.year ||
        got.month !== want.month ||
        got.day !== want.day
      ) {
        mismatches.push(key);
      }

      // 2. 旧実装と違う答えになるのは、洗い出した 8 日だけであること。
      const old = legacyVoidScopes(d, PAIR);
      const same =
        got.year === old.year && got.month === old.month && got.day === old.day;
      if (!same && !AFFECTED.has(key)) unexpected.push(key);
    }
    expect(mismatches).toEqual([]);
    expect(unexpected).toEqual([]);

    // 支の組をまたがない日は 6 通りすべてで確かめる（盤は組み直さない）。
    for (const pair of ALL_VOID_PAIRS) {
      for (let i = 0; i < 1461; i++) {
        const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
        const key = new Date(d.getTime() + 9 * 3600000)
          .toISOString()
          .slice(0, 10);
        if (AFFECTED.has(key)) continue;
        expect([key, pair.join(""), boardVoidScopes(d, pair)]).toEqual([
          key,
          pair.join(""),
          legacyVoidScopes(d, pair),
        ]);
      }
    }
  });

  it("節入りが 9 時〜正午に来る 8 日で、旧実装は月支が 1 つ手前だった", () => {
    // 旧実装との差がある日を名指しで固定する。ここが空になると
    // 「直したつもりで何も変わっていない」ことに気付けない。
    const noon = (y: number, m: number, d: number) => {
      const at = directionBoardInstant(jstNoon(y, m, d), 0, NAGOYA_LON);
      return getCurrentZodiac(at, NAGOYA_LON).monthZodiac;
    };
    const nine = (y: number, m: number, d: number) => {
      const at = directionBoardInstant(jstNoon(y, m, d), 0, NAGOYA_LON);
      return getCurrentZodiac(
        new Date(at.toISOString().split("T")[0]),
        NAGOYA_LON,
      ).monthZodiac;
    };
    const cases: [number, number, number, string, string][] = [
      [2026, 7, 7, "未", "午"], // 小暑
      [2026, 12, 7, "子", "亥"], // 大雪
      [2027, 2, 4, "寅", "丑"], // 立春
      [2027, 4, 5, "辰", "卯"], // 清明
      [2028, 3, 5, "卯", "寅"], // 啓蟄
      [2028, 9, 7, "酉", "申"], // 白露
      [2029, 1, 5, "丑", "子"], // 小寒
      [2029, 11, 7, "亥", "戌"], // 立冬
    ];
    for (const [y, m, d, atNoon, at9] of cases) {
      expect([y, m, d, noon(y, m, d)]).toEqual([y, m, d, atNoon]);
      expect([y, m, d, nine(y, m, d)]).toEqual([y, m, d, at9]);
    }
  });

  it("うち 3 日は月天中殺の当たり外れそのものが変わる", () => {
    // 8 日のうち 5 日は 1 つ手前の支が同じ天中殺の組に入るため
    // （午→未 など）、当たり判定としては変わらない。組をまたぐ
    // 3 日だけが実際の答えを変える。**この 3 日が本件の実害。**
    const cases: [number, number, number, string[], boolean, boolean][] = [
      // 年月日, 天中殺の組, 直した後, 旧実装
      [2026, 12, 7, ["子", "丑"], true, false], // 子(正午) / 亥(9時)
      [2026, 12, 7, ["戌", "亥"], false, true],
      [2027, 2, 4, ["寅", "卯"], true, false], // 寅(正午) / 丑(9時)
      [2027, 2, 4, ["子", "丑"], false, true],
      [2027, 4, 5, ["辰", "巳"], true, false], // 辰(正午) / 卯(9時)
      [2027, 4, 5, ["寅", "卯"], false, true],
    ];
    for (const [y, m, d, pair, now, before] of cases) {
      const date = jstNoon(y, m, d);
      const label = `${y}-${m}-${d} ${pair.join("")}`;
      expect([label, judgeDay(date, params(pair)).voidScopes.month]).toEqual([
        label,
        now,
      ]);
      // 旧実装だと逆になっていたことを、同じ入力で示す。
      expect([label, legacyVoidScopes(date, pair).month]).toEqual([
        label,
        before,
      ]);
    }
  });

  it("その 3 日は「天中殺で移転不可」の答えまで変わる", () => {
    // voidScopes が変わるだけでなく、strict では移転可否そのものが動く。
    // 画面に出るのはこちら。
    expect(
      judgeDay(jstNoon(2026, 12, 7), params(["子", "丑"])).blockedByTenchusatsu,
    ).toBe(true);
    expect(
      judgeDay(jstNoon(2026, 12, 7), params(["戌", "亥"])).blockedByTenchusatsu,
    ).toBe(false);
    expect(
      judgeDay(jstNoon(2027, 2, 4), params(["寅", "卯"])).blockedByTenchusatsu,
    ).toBe(true);
    expect(
      judgeDay(jstNoon(2027, 2, 4), params(["子", "丑"])).blockedByTenchusatsu,
    ).toBe(false);
  });
});
