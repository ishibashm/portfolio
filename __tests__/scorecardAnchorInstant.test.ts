import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { directionBoardInstant } from "@/utils/boardInstant";
import { calculateSolarTime } from "@/utils/solarTime";
import {
  getCurrentEnvironmentalFrequencies,
  solarTermMonthAnchor,
} from "@/utils/ephemerisEngine";

/**
 * dashboard の「本命星ごとの表」（scorecardHonmeiStarsForecast）と
 * 12 か月ヒートマップの起点を、地図と同じ評価時刻に揃えた件の固定。
 *
 * 30 日予報は forecastAnchor.test（#563 の系）で地図に揃えてあったが、
 * 同じ SolarTimeClock の中に**同じ旧実装が 2 か所残っていた**。
 *
 *   const testDate = calculateSolarTime(
 *     new Date(baseTime.getTime() + timeOffsetDays * 86400000), lon,
 *   ).solarTime;
 *
 * 「今この瞬間」を太陽時に直したものなので、節入りが日中に来る日は
 * 地図（その日の正午）と別の月盤になる。字面（calculateSolarTime）で
 * 探せば見つかったはずのものが漏れていた。ここでは
 *
 *   1. 旧実装を legacyInstant として写し、
 *   2. 新実装が 2026 年の全日 × 4 時刻で地図と同じ盤になることを固定し、
 *   3. **旧実装だと落ちる**実例（forecastAnchor.test と同じ 6 件）を置き、
 *   4. SolarTimeClock に calculateSolarTime の呼び出しが 1 つ（時計）しか
 *      無いことを見張る
 *
 * の 4 つを置く。
 */

const LON = 139.6917;

const jstClock = (
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute = 0,
) => new Date(Date.UTC(year, monthIndex, day, hour - 9, minute, 0, 0));

/** 変更前。**現行実装のどこからも呼ばれていない。** */
function legacyInstant(baseTime: Date, timeOffsetDays: number): Date {
  return calculateSolarTime(
    new Date(baseTime.getTime() + timeOffsetDays * 86400000),
    LON,
  ).solarTime;
}

/** 変更後 ＝ 地図と同じ。 */
function currentInstant(baseTime: Date, timeOffsetDays: number): Date {
  return directionBoardInstant(baseTime, timeOffsetDays, LON);
}

function boardOf(instant: Date) {
  const e = getCurrentEnvironmentalFrequencies(instant, LON, "coupled");
  return {
    yearStar: e.yearStar,
    monthStar: e.monthStar,
    dayStar: e.dayStar,
    classicalYearStar: e.classicalYearStar,
    classicalMonthStar: e.classicalMonthStar,
    classicalDayStar: e.classicalDayStar,
  };
}

describe("本命星ごとの表と 12 か月ヒートマップの評価時刻", () => {
  it("2026 年のどの日・どの時刻に見ても、地図と同じ盤になる", () => {
    const mismatches: string[] = [];
    for (let d = 0; d < 365; d++) {
      for (const h of [0, 9, 15, 23]) {
        const now = jstClock(2026, 0, 1 + d, h, 37);
        for (const off of [0, 7]) {
          const mine = boardOf(currentInstant(now, off));
          const map = boardOf(directionBoardInstant(now, off, LON));
          if (JSON.stringify(mine) !== JSON.stringify(map)) {
            mismatches.push(`${now.toISOString()} +${off}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("旧実装は節入りが日中に来る日で地図と食い違う（この修正の対象）", () => {
    // forecastAnchor.test と同じ実例。どれも節入りが日中に来る日。
    const known: { date: [number, number, number]; hour: number }[] = [
      { date: [2026, 1, 4], hour: 3 }, // 立春
      { date: [2026, 6, 7], hour: 3 }, // 小暑
      { date: [2026, 6, 7], hour: 9 },
      { date: [2026, 9, 8], hour: 15 }, // 寒露
      { date: [2026, 11, 7], hour: 3 }, // 大雪
      { date: [2026, 11, 7], hour: 9 },
    ];
    let differing = 0;
    for (const { date, hour } of known) {
      const now = jstClock(date[0], date[1], date[2], hour, 30);
      const legacy = boardOf(legacyInstant(now, 0));
      const map = boardOf(directionBoardInstant(now, 0, LON));
      if (JSON.stringify(legacy) !== JSON.stringify(map)) differing++;
      // 新実装は必ず一致する。
      expect(boardOf(currentInstant(now, 0))).toEqual(map);
    }
    // 旧実装を戻すとここで落ちる。空回りするテストを避けるための確認。
    expect(differing).toBe(known.length);
  });

  it("12 か月の起点（節月の代表点）も、旧実装だと先頭の列が前の節月に落ちる", () => {
    // 立春 2026-02-04 の未明。旧実装は「今この瞬間」（立春の前）を起点に
    // するので、先頭の列が丑月（前の節月）になる。新実装は正午（立春の
    // 後）なので寅月。
    const now = jstClock(2026, 1, 4, 3, 30);
    const legacyAnchor = solarTermMonthAnchor(legacyInstant(now, 0));
    const currentAnchor = solarTermMonthAnchor(currentInstant(now, 0));
    expect(legacyAnchor.getTime()).not.toBe(currentAnchor.getTime());
    // 地図と同じ評価時刻から出す代表点と一致する。
    expect(currentAnchor.getTime()).toBe(
      solarTermMonthAnchor(directionBoardInstant(now, 0, LON)).getTime(),
    );
  });

  it("SolarTimeClock で calculateSolarTime を呼ぶのは時計の 1 か所だけ", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/SolarTimeClock.tsx"),
      "utf8",
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 残る 1 つは setSolarData（時盤・十二支の刻に「今この瞬間」が要る）。
    expect(code.match(/calculateSolarTime\(/g)).toHaveLength(1);
    expect(code).toMatch(/setSolarData\(calculateSolarTime\(/);
  });
});
