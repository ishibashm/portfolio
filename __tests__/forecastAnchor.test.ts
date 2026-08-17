import { describe, it, expect } from "vitest";
import { directionBoardInstant, forecastAnchorMs } from "@/utils/boardInstant";
import { calculateSolarTime } from "@/utils/solarTime";
import { getCurrentEnvironmentalFrequencies } from "@/utils/ephemerisEngine";

/**
 * 30 日予報（scorecard30DaysForecast / …AllModels）の**評価時刻**を
 * 地図・ヒートマップと揃えた件の固定。
 *
 * 変更前は「今この瞬間」を起点にしていた。
 *
 *   const testDateLocal = new Date(baseTime.getTime() + i * 86400000);
 *   const testDate = calculateSolarTime(testDateLocal, lon).solarTime;
 *
 * 地図とヒートマップは directionBoardInstant で**その日の正午**を使う。
 * 起点が違うので、節入り（節月の替わり目）が日中に来る日は、同じ日を
 * 見ているのに地図と予報で月盤が別物になっていた。
 *
 * ここでは
 *
 *   1. 旧実装を legacyForecastInstant として写し、
 *   2. 新実装が地図と一致することを広い範囲（2026 年の全日 × 4 時刻 ×
 *      予報の 1 日目と 30 日目）で固定し、
 *   3. **旧実装だと落ちる**ことを実例で示す
 *
 * の 3 つを置く。3 が無いと「何を変えたのか」を自分でも確かめられない。
 */

const LON = 139.6917;

/** 変更前の評価時刻。**この関数は現行実装のどこからも呼ばれていない。** */
function legacyForecastInstant(
  baseTime: Date,
  lon: number,
  dayOffset: number,
): Date {
  const local = new Date(baseTime.getTime() + dayOffset * 86400000);
  return calculateSolarTime(local, lon).solarTime;
}

/**
 * 変更後。SolarTimeClock の 30 日予報が組み立てているものと同じ
 * （forecastAnchorMs で日に丸めてから、地図と同じ directionBoardInstant）。
 * 丸め方を変えるとここが落ちる。
 */
function forecastInstant(baseTime: Date, lon: number, dayOffset: number): Date {
  const anchor = new Date(forecastAnchorMs(baseTime));
  return directionBoardInstant(anchor, 0, lon, dayOffset);
}

/** 地図が使う評価時刻（timeOffsetDays で日を送る形）。 */
function mapInstant(baseTime: Date, lon: number, dayOffset: number): Date {
  return directionBoardInstant(baseTime, dayOffset, lon, 0);
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

const HOURS = [0, 9, 15, 23];
const DAY_OFFSETS = [0, 29];

describe("30 日予報の評価時刻", () => {
  it("2026 年のどの日・どの時刻に見ても、地図と同じ盤になる", () => {
    const mismatches: string[] = [];

    for (let d = 0; d < 365; d++) {
      for (const h of HOURS) {
        const now = new Date(2026, 0, 1 + d);
        now.setHours(h, 37, 13, 456);
        for (const off of DAY_OFFSETS) {
          const mine = boardOf(forecastInstant(now, LON, off));
          const map = boardOf(mapInstant(now, LON, off));
          if (JSON.stringify(mine) !== JSON.stringify(map)) {
            mismatches.push(
              `${now.toISOString()} +${off}日: 予報 ${JSON.stringify(mine)} / 地図 ${JSON.stringify(map)}`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("旧実装は節入りが日中に来る日で地図と食い違う（この修正の対象）", () => {
    // 2026 年に旧実装と地図がずれた日と時刻。実行して拾った実例。
    // 立春・啓蟄・清明…と、節入りが日中に来る日にちょうど当たる。
    const known: { date: [number, number, number]; hour: number }[] = [
      { date: [2026, 1, 3], hour: 21 }, // 立春（2/3）
      { date: [2026, 2, 5], hour: 15 }, // 啓蟄（3/5）
      { date: [2026, 3, 4], hour: 21 }, // 清明（4/4）
      { date: [2026, 4, 5], hour: 3 }, // 立夏（5/5）
      { date: [2026, 5, 5], hour: 15 }, // 芒種（6/5）
      { date: [2026, 7, 7], hour: 3 }, // 立秋（8/7）
      { date: [2026, 8, 7], hour: 15 }, // 白露（9/7）
    ];

    for (const { date, hour } of known) {
      const now = new Date(date[0], date[1], date[2]);
      now.setHours(hour, 30, 0, 0);

      const legacy = boardOf(legacyForecastInstant(now, LON, 0));
      const map = boardOf(mapInstant(now, LON, 0));

      // 旧実装を戻すとここで落ちる。空回りするテストを避けるための確認。
      expect(
        legacy,
        `${now.toISOString()} は旧実装と地図が一致してしまっている`,
      ).not.toEqual(map);

      // 新実装は同じ入力で地図と一致する。
      expect(boardOf(forecastInstant(now, LON, 0))).toEqual(map);
    }
  });

  it("見出しに使う日付は正午に寄せても変わらない", () => {
    // 予報の行見出しは new Date(anchor + i*86400000) の暦日。正午起点は
    // 日付の境目を跨がないので、0 時台・23 時台に見ても同じ日付になる。
    for (let d = 0; d < 365; d++) {
      for (const h of [0, 23]) {
        const now = new Date(2026, 0, 1 + d);
        now.setHours(h, 59, 59, 999);
        const anchor = new Date(now);
        anchor.setHours(12, 0, 0, 0);

        for (const off of DAY_OFFSETS) {
          const legacyLabel = new Date(now.getTime() + off * 86400000);
          const label = new Date(anchor.getTime() + off * 86400000);
          expect(label.getFullYear()).toBe(legacyLabel.getFullYear());
          expect(label.getMonth()).toBe(legacyLabel.getMonth());
          expect(label.getDate()).toBe(legacyLabel.getDate());
        }
      }
    }
  });
});
