import { describe, expect, it } from "vitest";
import { SearchSunLongitude } from "astronomy-engine";
import {
  getClassicalMonthStar,
  getClassicalYearStar,
} from "@/utils/ephemerisEngine";

/**
 * 節入りの時刻を、**暦エンジンとは別の天体計算**で確かめる
 * （2026-09-25 の精度確認。週替わりの (d)）。
 *
 * 暦エンジンの節入りは lunar-javascript の節気表から来る。これまでの固定値
 * （`kyuseiSolarTermBoundary`）は 2031 年までを国立天文台の暦要項などと
 * 手で突き合わせたもので、その先は見ていなかった。
 *
 * ここでは astronomy-engine（VSOP87 系。依存に既にある）で**太陽の視黄経が
 * 節の角度になる瞬間**を探し、その前後 3 分で盤が替わるかを見る。2 つの
 * 実装は独立しているので、片方の取り違えはもう片方に出る。
 *
 * 実測（2026-09-25）: 2026〜2040 年の立春で、両者の差は最大 38 秒
 * （2033 年）。lunar-javascript が返す時刻は北京時間（UTC+8）で、
 * そのまま読むと**ちょうど 1 時間早い**。エンジンは日本時間に直して
 * いるので盤は合う。直さない実装に戻すと、ここの「後 3 分」がまだ前の盤の
 * ままになって落ちる。
 *
 * 前後の幅を 3 分にしたのは、2 つの計算の差（秒の単位）より十分広く、
 * 日の境目で切り替える実装（#548 より前の年盤）とは区別できる狭さだから。
 */

const MIN = 60 * 1000;
const MARGIN = 3 * MIN;

/** その年の、太陽の視黄経が `lon` 度になる瞬間。 */
function termInstant(year: number, lon: number): Date {
  /* 小寒（285 度）だけは年初。他は立春（2 月頭）以降に来る */
  const from =
    lon === 285
      ? new Date(Date.UTC(year, 0, 1))
      : new Date(Date.UTC(year, 0, 20));
  const t = SearchSunLongitude(lon, from, 370);
  if (!t) throw new Error(`no term ${year} ${lon}`);
  return t.date;
}

/** 九星は 1 年ごとに 1 つ下がる（一白の次は九紫）。 */
const prevStar = (s: number) => (s === 1 ? 9 : s - 1);

const YEARS = Array.from({ length: 2045 - 2026 + 1 }, (_, i) => 2026 + i);

describe("立春（315 度）で年盤が替わる", () => {
  it.each(YEARS)("%i 年", (year) => {
    const t = termInstant(year, 315).getTime();
    const before = getClassicalYearStar(new Date(t - MARGIN));
    const after = getClassicalYearStar(new Date(t + MARGIN));
    expect(after).toBe(prevStar(before));
  });
});

/*
  月盤は 12 の節（小寒 285 度から 30 度おき）で替わる。中気（15 度ずれ）では
  替わらない。
*/
const SETSU = [285, 315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255];

describe("12 の節で月盤が替わる", () => {
  it.each(YEARS)("%i 年", (year) => {
    const misses: string[] = [];
    for (const lon of SETSU) {
      const t = termInstant(year, lon).getTime();
      const before = getClassicalMonthStar(new Date(t - MARGIN));
      const after = getClassicalMonthStar(new Date(t + MARGIN));
      if (after !== prevStar(before)) {
        misses.push(`${lon}°: ${before}→${after}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("中気（節の 15 度あと）では替わらない", () => {
    for (const lon of SETSU) {
      const mid = (lon + 15) % 360;
      const t = termInstant(2027, mid).getTime();
      expect(getClassicalMonthStar(new Date(t - MARGIN))).toBe(
        getClassicalMonthStar(new Date(t + MARGIN)),
      );
    }
  });
});
