import { describe, it, expect } from "vitest";
import {
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  getHonmeiStar,
  calculateVectorCollision,
  generateBoard,
  getSolarMonthIndex,
  getPhysicalMonthStar,
  getYearStar,
  getMonthStar,
} from "../src/utils/ephemerisEngine";
import { KigakuScorer } from "../src/utils/timing-optimizer/scorers/kigakuScorer";

describe("Kyusei Kigaku High-Precision Calculations", () => {
  it("should correctly calculate Honmei and Getsumei stars for 1997-06-15", () => {
    // 検算用の生年月日。以前は運営者のものを使っていた（公開リポジトリ）。
    const birthDate = new Date("1997-06-15T12:00:00+09:00");

    // Honmei (Classical) should be 3 (三碧木星)
    const yearStar = getClassicalYearStar(birthDate);
    expect(yearStar).toBe(3);

    // Getsumei (Classical) should be 1 (一白水星)
    const monthStar = getClassicalMonthStar(birthDate);
    expect(monthStar).toBe(1);
  });

  it("should verify day star changes and solar terms", () => {
    // A we-known date with standard day star, e.g., 2026-05-23
    const targetDate = new Date("2026-05-23T12:00:00+09:00");
    const dayStar = getClassicalDayStar(targetDate);

    // Check that it returns a valid star number
    expect(dayStar).toBeGreaterThanOrEqual(1);
    expect(dayStar).toBeLessThanOrEqual(9);
  });

  describe("KigakuScorer Timing and Spatial Blocker Integration", () => {
    it("returns null when targetDirection or coordinates are missing", () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date("2026-07-11T12:00:00+09:00"),
        userBirthDate: new Date("1997-06-15T12:00:00+09:00"),
        userKigakuStar: 3, // Classical Honmei Star for 1997-06-15
        actionType: "focus" as const,
        useClassical: true,
      };

      const result = scorer.observe(ctx);
      expect(result).toBeNull();
    });

    it("downgrades status to warning when a target direction has blockers", () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date("2026-07-11T12:00:00+09:00"),
        userBirthDate: new Date("1997-06-15T12:00:00+09:00"),
        userKigakuStar: 3,
        actionType: "focus" as const,
        useClassical: true,
        targetDirection: "E" as const, // East direction has Anken-satsu in Month Board
        actionIntent: "MIGRATION" as const,
        latitude: 35.6895,
        longitude: 139.6917,
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      expect(result!.phenomenon).toBe("警告・方位凶殺衝突");
      expect(result!.detail).toContain(
        "【警告・方位凶殺衝突】目的地（E方位）に凶殺「暗剣殺 (大凶)」が検出されています。",
      );
    });

    it("blocks the seasonal Doyou-satsu direction during a Doyou hazard period", () => {
      const targetDate = new Date("2026-07-25T12:00:00+09:00"); // Summer Doyou
      const yB = generateBoard(1);
      const mB = generateBoard(1);
      const dB = generateBoard(1);

      const collision = calculateVectorCollision(
        3, // personalStar
        yB,
        mB,
        dB,
        [], // voidZodiacs
        null, // lunarNodeLon
        "DEFAULT",
        targetDate,
        139.6917, // longitude
      );

      // Verify Summer Doyou-satsu blocks SW (坤宮) direction
      expect(collision.doyouState?.inDoyou).toBe(true);
      expect(collision.doyouState?.doyouType).toBe("SUMMER");
      expect(collision.finalVectors.SW).toBe("NOISE_GOU");
    });

    it("applies a soft warning for daily-level blocker under MIGRATION instead of absolute block", () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date("2026-07-04T12:00:00+09:00"), // Day has Center 3, E is NOISE_ANKEN
        userBirthDate: new Date("1997-06-15T12:00:00+09:00"),
        userKigakuStar: 3,
        actionType: "focus" as const,
        useClassical: true,
        targetDirection: "E" as const,
        actionIntent: "MIGRATION" as const,
        latitude: 35.6895,
        longitude: 139.6917,
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      expect(result!.phenomenon).toBe("一時的干渉・引越当日注意");
      expect(result!.detail).toContain(
        "【注意・引越当日ノイズ】年盤・月盤の長期的な方位エネルギーは極めて安全（吉）ですが、引越し当日（日盤）に一時的なノイズが重なっています。",
      );
    });

    it("correctly evaluates target direction stars when targetDirection is specified", () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date("2026-07-11T12:00:00+09:00"),
        userBirthDate: new Date("1997-06-15T12:00:00+09:00"),
        userKigakuStar: 3,
        actionType: "focus" as const,
        useClassical: true,
        targetDirection: "E" as const,
        actionIntent: "DEFAULT" as const,
        latitude: 35.6895,
        longitude: 139.6917,
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      // For Center (1, 3, 5) at East direction:
      // Year Center 1 -> E is 8. Wood (3) controls Earth (8) -> 相剋 (Shokoku)
      // Month Center 3 -> E is 1. Water (1) generates Wood (3) -> 相生 (Sojo)
      // Day Center 5 -> E is 3. Wood (3) is same as Wood (3) -> 比和 (Hiwa)
      expect(result!.detail).toContain(
        "[目的地E方位の年星:8(相剋)] [月星:1(相生)] [日星:3(比和)]",
      );
    });

    it("applies strict priority gating on layer merging, preventing OPTIMAL from masking noises", () => {
      const yB = generateBoard(1);
      const mB = generateBoard(3);
      const dB = generateBoard(5);

      const collision = calculateVectorCollision(
        3,
        yB,
        mB,
        dB,
        [],
        null,
        "MIGRATION",
        new Date("2026-07-11T12:00:00+09:00"),
        139.6917,
      );

      // Even with positive Year/Month element phases, presence of NOISE_ANKEN on Month
      // must absolute block and keep the final vector as NOISE_ANKEN.
      expect(collision.finalVectors.E).toBe("NOISE_ANKEN");
    });
  });

  describe("Physical Month Star Modes (Coupled vs Independent)", () => {
    it("correctly maps solar longitudes to solar month indices starting at 315 degrees", () => {
      // 315 deg is the start of Month 1 (寅月)
      expect(getSolarMonthIndex(315)).toBe(0);
      expect(getSolarMonthIndex(320)).toBe(0);
      expect(getSolarMonthIndex(345)).toBe(1); // Month 2 (卯月)
      expect(getSolarMonthIndex(0)).toBe(1); // still Month 2 (卯月)
      expect(getSolarMonthIndex(15)).toBe(2); // Month 3 (辰月)
      expect(getSolarMonthIndex(285)).toBe(11); // Month 12 (丑月)
    });

    it("calculates the independent month star based strictly on solar longitude", () => {
      const testDate = new Date("2026-06-15T12:00:00+09:00");
      const indepStar = getPhysicalMonthStar(testDate, "independent");
      const standardStar = getMonthStar(testDate);
      expect(indepStar).toBe(standardStar);
    });

    it("calculates the coupled month star dependent on the Year Star and month index", () => {
      const testDate = new Date("2026-06-15T12:00:00+09:00"); // June 15, 2026 is Month index 4 (午月)
      const yStar = getYearStar(testDate);
      const coupledStar = getPhysicalMonthStar(testDate, "coupled");

      // Determine starting star for month 1 (index 0) based on Year Star
      let startStar: number;
      const mod = yStar % 3;
      if (mod === 1) startStar = 8;
      else if (mod === 2) startStar = 5;
      else startStar = 2;

      // Month index is 4
      let expectedStar = startStar - 4;
      while (expectedStar <= 0) expectedStar += 9;
      expectedStar = expectedStar % 9 || 9;

      expect(coupledStar).toBe(expectedStar);
      expect(coupledStar).toBeGreaterThanOrEqual(1);
      expect(coupledStar).toBeLessThanOrEqual(9);
    });
  });
});
