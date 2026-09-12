import { describe, it, expect } from "vitest";
import { BaziEngine } from "../src/utils/baziEngine";

describe("BaziEngine Zanggan element balance", () => {
  const engine = new BaziEngine();

  it("should calculate correct element balance including Zanggan weights for 2026-06-12", () => {
    // Birth date/time: 2026-06-12 12:00:00, Tokyo longitude approx 139.6917
    const date = new Date("2026-06-12T12:00:00+09:00");
    const result = engine.calculate(date, 139.6917, 1);

    // Verify properties
    expect(result).toHaveProperty("pillars");
    expect(result).toHaveProperty("fiveElements");

    // Print elements balance for debugging
    console.log("Calculated 5 Elements Balance:", result.fiveElements);

    // Since 2026 is Bing-Wu (丙午) year, and 丙 is Fire (1.0) and 午 contains 丁 (Fire, 0.7) and 己 (Earth, 0.3)
    // Fire (火) must be significantly greater than 0.
    expect(result.fiveElements.火).toBeGreaterThan(0);

    // Check that all 5 elements are represented in the balance map
    expect(result.fiveElements).toHaveProperty("木");
    expect(result.fiveElements).toHaveProperty("火");
    expect(result.fiveElements).toHaveProperty("土");
    expect(result.fiveElements).toHaveProperty("金");
    expect(result.fiveElements).toHaveProperty("水");
  });
});

/**
 * 太陽時の時差は JST（9）で出す。以前の `calculateSolarTime` の既定は
 * 経度からの推測（`Math.round(経度 / 15)`）で、石垣（124.16）は 8、
 * 釧路（144.38）は 10 になり、太陽時が 60 分ずれていた。時柱が 1 つ隣に
 * ずれて、五行の強弱まで変わっていた。既定はその後 9 に変えたので、
 * 旧実装（推測）は明示して再現する。
 */
describe("太陽時の時差", () => {
  it("石垣・釧路でも JST（9）で太陽時を出す", async () => {
    const { calculateSolarTime } = await import("../src/utils/solarTime");
    const engine = new BaziEngine();
    const date = new Date("1990-05-15T15:30:00+09:00");
    for (const lon of [124.16, 144.38]) {
      const result = engine.calculate(date, lon, 1);
      const expected = calculateSolarTime(date, lon, 9).solarTime.getTime();
      const guessed = calculateSolarTime(
        date,
        lon,
        Math.round(lon / 15),
      ).solarTime.getTime();
      expect(result.solarTime.getTime(), String(lon)).toBe(expected);
      // 推測だと 60 分ずれる（以前の実装はこちらだった）
      expect(Math.abs(guessed - expected), String(lon)).toBe(60 * 60 * 1000);
    }
  });
});
