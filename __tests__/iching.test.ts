import { describe, it, expect } from "vitest";
import { IChingClient } from "../src/lib/ichingClient";
import { AstroEngine, getCurrentZodiac } from "../src/utils/ephemerisEngine";
import { bearingToDirection } from "../src/app/api/relocation/history/route";
import { calculateAspectWeight } from "../src/utils/nbaEngine";
import { getLongitudeCorrection } from "../src/utils/solarTime";

describe("Metaphysical Decision Engine Calibration & Verification Tests", () => {
  const iching = new IChingClient();

  describe("IChingClient getHexagramByNumber lookup", () => {
    it("should return the correct defined hexagram for 1 (乾) and 2 (坤)", () => {
      const hex1 = iching.getHexagramByNumber(1);
      expect(hex1.number).toBe(1);
      expect(hex1.name).toContain("乾 (Qian)");
      expect(hex1.riskModifier).toBe(-10);
      expect(hex1.confidenceBoost).toBe(0.15);

      const hex2 = iching.getHexagramByNumber(2);
      expect(hex2.number).toBe(2);
      expect(hex2.name).toContain("坤 (Kun)");
      expect(hex2.riskModifier).toBe(-5);
      expect(hex2.confidenceBoost).toBe(0.1);
    });

    it("should return a dynamically constructed hexagram for undefined keys (e.g. 15 謙) with safe defaults", () => {
      const hex15 = iching.getHexagramByNumber(15);
      expect(hex15.number).toBe(15);
      expect(hex15.name).toContain("謙 (Qian)");
      expect(hex15.character).toBe("謙");
      expect(hex15.pinyin).toBe("Qian");
      expect(hex15.riskModifier).toBe(0);
      expect(hex15.confidenceBoost).toBe(0);
      expect(hex15.actionAdvice).toBe("安定した状態です。慎重に状況を見極めましょう。");
    });
  });

  describe("AstroEngine Sidereal Time wrapping", () => {
    it("should strictly wrap Local Sidereal Time (LST) to [0, 24)", () => {
      const testDate = new Date("2026-06-12T12:00:00Z");
      const lst1 = AstroEngine.getLocalSiderealTime(testDate, 139.6917);
      expect(lst1).toBeGreaterThanOrEqual(0);
      expect(lst1).toBeLessThan(24);

      const lstExtremeEast = AstroEngine.getLocalSiderealTime(testDate, 500.0);
      expect(lstExtremeEast).toBeGreaterThanOrEqual(0);
      expect(lstExtremeEast).toBeLessThan(24);

      const lstExtremeWest = AstroEngine.getLocalSiderealTime(testDate, -500.0);
      expect(lstExtremeWest).toBeGreaterThanOrEqual(0);
      expect(lstExtremeWest).toBeLessThan(24);
    });
  });

  describe("Hour Zodiac solar-local time alignment", () => {
    it("should map hours to the correct Bazi earthly branches based on JST local-solar time", () => {
      // 23:00 to 01:00 is 子 (Zi)
      const dateZi = new Date("2026-06-12T23:30:00+09:00");
      const zodiacZi = getCurrentZodiac(dateZi, 139.6917);
      expect(zodiacZi.hourZodiac).toBe("子");

      // 01:00 to 03:00 is 丑 (Chou)
      const dateChou = new Date("2026-06-12T02:00:00+09:00");
      const zodiacChou = getCurrentZodiac(dateChou, 139.6917);
      expect(zodiacChou.hourZodiac).toBe("丑");

      // 11:00 to 13:00 is 午 (Wu)
      const dateWu = new Date("2026-06-12T12:00:00+09:00");
      const zodiacWu = getCurrentZodiac(dateWu, 139.6917);
      expect(zodiacWu.hourZodiac).toBe("午");
    });
  });

  describe("Kigaku Asymmetric Direction Sector Mapping", () => {
    it("should map 70° to E (East) under standard 45-degree equal division", () => {
      const dirStandard = bearingToDirection(70, false);
      expect(dirStandard).toBe("E");
    });

    it("should map 70° to NE (North-East) under Kigaku asymmetric 30/60 degree division", () => {
      const dirClassical = bearingToDirection(70, true);
      expect(dirClassical).toBe("NE");
    });

    it("should map 76° to E (East) under Kigaku asymmetric 30/60 degree division", () => {
      const dirClassical = bearingToDirection(76, true);
      expect(dirClassical).toBe("E");
    });
  });

  describe("Astrological Aspect Weight Orb Decay", () => {
    it("should calculate correct decay weights based on orb proximity", () => {
      // Exact alignment (0° orb) -> 1.0 weight
      const weight0 = calculateAspectWeight(0.0, 5.0);
      expect(weight0).toBeCloseTo(1.0);

      // Boundary alignment (5° maxOrb) -> 0.0 weight
      const weight5 = calculateAspectWeight(5.0, 5.0);
      expect(weight5).toBe(0.0);

      // Middle alignment (2.5° orb) -> cos(pi/4) ≈ 0.707
      const weightHalf = calculateAspectWeight(2.5, 5.0);
      expect(weightHalf).toBeCloseTo(0.7071, 4);

      // Over maxOrb -> 0.0 weight
      const weightOver = calculateAspectWeight(6.0, 5.0);
      expect(weightOver).toBe(0.0);
    });
  });

  describe("Kyoto Solar Time Longitude Correction", () => {
    it("should calculate longitude correction for Kyoto (135.7248°) as exactly 2.8992 minutes for JST timezone", () => {
      const correction = getLongitudeCorrection(135.7248, 9);
      expect(correction).toBeCloseTo(2.8992, 4);
    });

    it("should calculate correct longitude correction for Tokyo (139.6917°) as exactly 18.7668 minutes for JST timezone", () => {
      const correction = getLongitudeCorrection(139.6917, 9);
      expect(correction).toBeCloseTo(18.7668, 4);
    });
  });
});
