import { describe, expect, it } from "vitest";
import {
  getClassicalMonthStar,
  getCurrentZodiac,
} from "@/utils/ephemerisEngine";
import { calculateSolarTime } from "@/utils/solarTime";

const LON = 139.6917;

/** その日の正午（判定に使う時刻）を太陽時にしたもの。 */
function noon(iso: string) {
  return calculateSolarTime(new Date(`${iso}T12:00:00+09:00`), LON).solarTime;
}

describe("月盤の星と月支の境界", () => {
  it("節入り当日に星だけ先に変わらない（2026年の立秋）", () => {
    // 2026 年の立秋は 8/7 20:43 JST。判定に使う正午時点ではまだ立秋前なので、
    // 8/7 は未月（三碧）、8/8 から申月（二黒）でなければならない。
    // 修正前は星だけが 8/7 に切り替わり、未月の天道が申月の盤に当たっていた。
    expect(getCurrentZodiac(noon("2026-08-07"), LON).monthZodiac).toBe("未");
    expect(getClassicalMonthStar(noon("2026-08-07"))).toBe(3);

    expect(getCurrentZodiac(noon("2026-08-08"), LON).monthZodiac).toBe("申");
    expect(getClassicalMonthStar(noon("2026-08-08"))).toBe(2);
  });

  it("1年を通して、星と月支が必ず同じ日に切り替わる", () => {
    let prevStar: number | null = null;
    let prevZhi: string | null = null;
    const mismatches: string[] = [];
    let switches = 0;

    for (let t = Date.UTC(2026, 0, 1, 3); t <= Date.UTC(2027, 0, 1, 3); t += 86400000) {
      const solar = calculateSolarTime(new Date(t), LON).solarTime;
      const star = getClassicalMonthStar(solar);
      const zhi = getCurrentZodiac(solar, LON).monthZodiac;
      if (prevStar !== null) {
        const starChanged = star !== prevStar;
        const zhiChanged = zhi !== prevZhi;
        if (starChanged !== zhiChanged) {
          mismatches.push(
            `${new Date(t).toISOString().slice(0, 10)} 星${prevStar}->${star} 月支${prevZhi}->${zhi}`,
          );
        }
        if (starChanged) switches += 1;
      }
      prevStar = star;
      prevZhi = zhi;
    }

    expect(mismatches, mismatches.join(" / ")).toEqual([]);
    // 節入りは年 12 回。
    expect(switches).toBe(12);
  });

  it("節月の途中では星が動かない", () => {
    // 同じ節月の中なら、日が変わっても月盤の星は同じ。
    const days = ["2026-08-09", "2026-08-15", "2026-08-25", "2026-09-05"];
    const stars = days.map((d) => getClassicalMonthStar(noon(d)));
    expect(new Set(stars).size).toBe(1);
    expect(stars[0]).toBe(2);
  });

  it("複数年で 1〜9 の範囲を外れない", () => {
    for (let t = Date.UTC(2024, 0, 1, 3); t < Date.UTC(2029, 0, 1, 3); t += 5 * 86400000) {
      const star = getClassicalMonthStar(calculateSolarTime(new Date(t), LON).solarTime);
      expect(star, new Date(t).toISOString()).toBeGreaterThanOrEqual(1);
      expect(star, new Date(t).toISOString()).toBeLessThanOrEqual(9);
    }
  });
});
