import { describe, it, expect } from "vitest";
import { IChingClient } from "../src/lib/ichingClient";
import { AstroEngine, getCurrentZodiac } from "../src/utils/ephemerisEngine";
import { getKigakuSector } from "../src/utils/kigakuUtils";
import {
  calculateAspectWeight,
  NBAEngine,
  NBAParams,
} from "../src/utils/nbaEngine";
import {
  getLongitudeCorrection,
  calculateSolarTime,
} from "../src/utils/solarTime";
import { calculateBioMetrics } from "../src/utils/bioModelingEngine";
import { VedicEngine } from "../src/utils/vedicEngine";

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
      expect(hex15.actionAdvice).toBe(
        "安定した状態です。慎重に状況を見極めましょう。",
      );
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
      const dirStandard = getKigakuSector(70, false);
      expect(dirStandard).toBe("E");
    });

    it("should map 70° to NE (North-East) under Kigaku asymmetric 30/60 degree division", () => {
      const dirClassical = getKigakuSector(70, true);
      expect(dirClassical).toBe("NE");
    });

    it("should map 76° to E (East) under Kigaku asymmetric 30/60 degree division", () => {
      const dirClassical = getKigakuSector(76, true);
      expect(dirClassical).toBe("E");
    });

    it("should map to correct sectors using the getKigakuSector utility directly", () => {
      expect(getKigakuSector(70, false)).toBe("E");
      expect(getKigakuSector(70, true)).toBe("NE");
      expect(getKigakuSector(76, true)).toBe("E");
      expect(getKigakuSector(-30, true)).toBe("NW"); // Negative wrap-around (-30° -> 330° is NW classical)
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
    it("should calculate longitude correction for Kyoto (135.7588°) as exactly 3.0352 minutes for JST timezone", () => {
      const correction = getLongitudeCorrection(135.7588, 9);
      expect(correction).toBeCloseTo(3.0352, 4);
    });

    it("should calculate correct longitude correction for Tokyo (139.6917°) as exactly 18.7668 minutes for JST timezone", () => {
      const correction = getLongitudeCorrection(139.6917, 9);
      expect(correction).toBeCloseTo(18.7668, 4);
    });
  });

  describe("Biometric Z-Score Reliability Correction (Wearable Displacement Decay)", () => {
    it("should apply reliability attenuation to zScoreHRV when hardwareDisplacementPenalty > 1.0", () => {
      // Base parameters
      const baseParams = {
        currentHRV: 45, // below baseline mean (stress condition)
        currentGSR: 5,
        baselineHRVMean: 60,
        baselineHRVStd: 10,
        baselineGSRMean: 5,
        baselineGSRStd: 2,
        elevation: 0,
        kpIndex: 3,
        solarTimeHours: 12,
        baseSyncDays: 0,
      };

      // Case A: No displacement (birth coordinates same as current coordinates)
      const resNoDisplacement = calculateBioMetrics({
        ...baseParams,
        birthLat: 35.6762,
        birthLon: 139.6503,
        currentLat: 35.6762,
        currentLon: 139.6503,
      });

      // Case B: Relocation displacement (Tokyo to Kyoto, ~370km away, displacement penalty ~0.925 <= 1.0)
      const resSmallDisplacement = calculateBioMetrics({
        ...baseParams,
        birthLat: 35.6762, // Tokyo
        birthLon: 139.6503,
        currentLat: 35.0116, // Kyoto
        currentLon: 135.7681,
      });

      // Case C: Large relocation displacement (Tokyo to London, ~9500km away, penalty > 1.0)
      const resLargeDisplacement = calculateBioMetrics({
        ...baseParams,
        birthLat: 35.6762, // Tokyo
        birthLon: 139.6503,
        currentLat: 51.5074, // London
        currentLon: -0.1278,
      });

      // Without displacement (A), raw Z-score is (45 - 60)/10 = -1.5. No attenuation since penalty is 0.
      expect(resNoDisplacement.hardwareDisplacementPenalty).toBe(0);
      expect(resNoDisplacement.zScoreHRV).toBeCloseTo(-1.5, 4);

      // With small displacement (B), penalty is ~0.92, which is <= 1.0. Still no attenuation.
      expect(
        resSmallDisplacement.hardwareDisplacementPenalty,
      ).toBeLessThanOrEqual(1.0);
      expect(resSmallDisplacement.zScoreHRV).toBeCloseTo(-1.5, 4);

      // With large displacement (C), penalty is > 1.0. Z-Score should be attenuated (divided by penalty).
      expect(resLargeDisplacement.hardwareDisplacementPenalty).toBeGreaterThan(
        1.0,
      );
      expect(Math.abs(resLargeDisplacement.zScoreHRV)).toBeLessThan(1.5);

      const expectedAttenuatedZ =
        -1.5 / resLargeDisplacement.hardwareDisplacementPenalty;
      expect(resLargeDisplacement.zScoreHRV).toBeCloseTo(
        expectedAttenuatedZ,
        4,
      );

      // Verify it reduces ansLoad (prevents false-positive stress) compared to the unattenuated case (which would be ~56)
      expect(resLargeDisplacement.ansLoad).toBeLessThan(56);
    });

    it("should safely handle zero-division via guards when baseline std devs are zero", () => {
      const res = calculateBioMetrics({
        currentHRV: 60,
        currentGSR: 5,
        baselineHRVMean: 60,
        baselineHRVStd: 0, // Zero standard deviation
        baselineGSRMean: 5,
        baselineGSRStd: 0, // Zero standard deviation
        birthLat: 35.6762,
        birthLon: 139.6503,
        currentLat: 35.6762,
        currentLon: 139.6503,
        elevation: 0,
        kpIndex: 3,
        solarTimeHours: 12,
        baseSyncDays: 0,
      });

      expect(res.zScoreHRV).toBe(0); // Should not be NaN or Infinity
    });
  });

  describe("Vimshottari Dasha Calculation (Sidereal Moon Correction)", () => {
    it("should calculate active Dasha for birth date 1997-06-15 04:26 at evaluation date 2026-06-12", () => {
      // 検算用の生年月日。以前は運営者のものを使っていた（公開リポジトリ）。
      // 期待値は入れ替えたあとの実測値。
      const birthDate = new Date("1997-06-15T04:26:00+09:00");
      const evaluationDate = new Date("2026-06-12T12:00:00+09:00");

      const vedic = new VedicEngine();
      const result = vedic.calculateVimshottariDasha(birthDate, evaluationDate);

      expect(result.mahadasha).toBe("Rahu");
      expect(result.antardasha).toBe("Mars");
      expect(result.formatted).toContain("ラーフ-火星期");
      expect(result.formatted).toContain("Rahu-Mars");
    });
  });

  describe("Bazi Day Master Compatibility (Draining Reversal)", () => {
    it("should penalize compatibility when a weak Day Master generates the environment", async () => {
      const nba = new NBAEngine();

      // State with weak Day Master (Wood) in Fire environment
      const stateWeak: NBAParams["stateVector"] = {
        ansLoad: 30,
        shieldCapacity: 80,
        environmentalNoise: "Low",
        environmentalRisk: 40,
        solarPhase: 120,
        isVoidTime: false,
        isConflictDay: false,
        isDoyouHazard: false,
        ragContext: {
          source: "test",
          personalBazi: {
            summary: {
              dayMaster: "甲",
              dayMasterWuxing: "木",
              strength: "身弱",
            },
          },
          classicalRules: {
            summary: {
              dayMasterWuxing: "火",
            },
          },
        },
      };

      // State with strong Day Master (Wood) in Fire environment
      const stateStrong: NBAParams["stateVector"] = {
        ...stateWeak,
        ragContext: {
          source: "test",
          personalBazi: {
            summary: {
              dayMaster: "甲",
              dayMasterWuxing: "木",
              strength: "身旺",
            },
          },
          classicalRules: {
            summary: {
              dayMasterWuxing: "火",
            },
          },
        },
      };

      const resultWeak = await nba.getNextBestAction({
        stateVector: stateWeak,
      });
      const resultStrong = await nba.getNextBestAction({
        stateVector: stateStrong,
      });

      // Verify in the logic trace that weak DM gets PERSONAL = -0.5, while strong gets PERSONAL = 0.5
      const traceWeakInit = resultWeak.logicTrace.find((t) =>
        t.includes("[INIT] Features:"),
      );
      const traceStrongInit = resultStrong.logicTrace.find((t) =>
        t.includes("[INIT] Features:"),
      );

      expect(traceWeakInit).toContain("PERSONAL=-0.50");
      expect(traceStrongInit).toContain("PERSONAL=0.50");
    });
  });

  describe("Lunar Tide Risk Scaling", () => {
    it("should correctly scale and cap tideRisk under 30", () => {
      // Simulate different gravitationalTideScores
      const testScores = [0, 5, 10, 15, 20];

      testScores.forEach((score) => {
        const rawTideRisk = (score / 20.0) * 100;
        const tideRisk = Math.min(30, rawTideRisk * 0.4);

        expect(tideRisk).toBeLessThanOrEqual(30);
        if (score === 20) {
          // Max score 20 -> raw 100 -> scaled 100 * 0.4 = 40, capped at 30
          expect(tideRisk).toBe(30);
        } else if (score === 10) {
          // Mid score 10 -> raw 50 -> scaled 50 * 0.4 = 20
          expect(tideRisk).toBe(20);
        }
      });
    });

    describe("Phase 5 Production Optimizations and Edge-Case Guards", () => {
      it("should format solarTime to JSON as local ISO string with captured timezone offset", () => {
        const testDate = new Date("2026-06-13T00:14:03Z");
        const solarResult = calculateSolarTime(testDate, 135.75, 9);
        const jsonStr = JSON.stringify(solarResult.solarTime);
        // Assert that the JSON string has correct timezone offset (+09:00)
        expect(jsonStr).toContain("+09:00");
        // Check formatting structure: e.g. "YYYY-MM-DDTHH:mm:ss.sss+09:00" (enclosed in quotes)
        expect(jsonStr).toMatch(
          /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00"$/,
        );
      });

      /*
        以前ここは「逆行のアスペクトは重みが減衰するので、
        aspectsRiskScore が下がる」ことを固定していた。

          expect(layersWithRetro.astrophysical.aspectsRiskScore)
            .toBeLessThan(layersNoRetro.astrophysical.aspectsRiskScore);

        西洋占星術のアスペクトを判定から外したので、**この前提はもう
        成り立たない。**利用者の判断で「案内どおり占星術は使わない」に
        揃えた（詳細は nbaEngine.ts の encodeStateLayers と
        __tests__/nbaAstrologyExcluded.test.ts）。

        テストは消さず、**逆向きの主張に書き換える。**アスペクトの補正が
        戻ってきたらここで落ちる。
      */
      it("should NOT let celestial aspects move the risk score (astrology excluded)", async () => {
        const nba = new NBAEngine();

        const transits = ["MERCURY SQUARE SUN ORB: 2.50"];

        const base: NBAParams["stateVector"] = {
          ansLoad: 50,
          shieldCapacity: 50,
          environmentalNoise: "test",
          environmentalRisk: 40,
          solarPhase: 120,
        };

        const noAstrology = nba.encodeStateLayers(base);
        const softAspects = nba.encodeStateLayers({
          ...base,
          astrologyData: {
            source: "test",
            transits: ["VENUS TRINE MOON ORB: 1.00"],
            retrogrades: [],
          },
        });
        const hardAspects = nba.encodeStateLayers({
          ...base,
          astrologyData: { source: "test", transits, retrogrades: [] },
        });
        const withRetrograde = nba.encodeStateLayers({
          ...base,
          astrologyData: { source: "test", transits, retrogrades: ["MERCURY"] },
        });

        // 環境リスク（40）そのもの。トランジットも逆行も足し引きしない。
        for (const layers of [
          noAstrology,
          softAspects,
          hardAspects,
          withRetrograde,
        ]) {
          expect(layers.astrophysical.aspectsRiskScore).toBe(0.4);
        }
      });

      it("should default displacement penalty to 1.0 at Null Island (GPS loss)", () => {
        // Normal coordinates
        const normalResult = calculateBioMetrics({
          currentHRV: 60,
          currentGSR: 5,
          birthLat: 35.6762,
          birthLon: 139.6503,
          currentLat: 33.5902,
          currentLon: 130.4017, // Tokyo to Fukuoka
          elevation: 50,
          kpIndex: 3,
          solarTimeHours: 12,
          baseSyncDays: 5,
        });
        expect(normalResult.hardwareDisplacementPenalty).toBeGreaterThan(1.0);

        // Null Island coords (birth coordinates lost)
        const birthLostResult = calculateBioMetrics({
          currentHRV: 60,
          currentGSR: 5,
          birthLat: 0.0,
          birthLon: 0.0,
          currentLat: 34.6937,
          currentLon: 135.5023,
          elevation: 50,
          kpIndex: 3,
          solarTimeHours: 12,
          baseSyncDays: 5,
        });
        expect(birthLostResult.hardwareDisplacementPenalty).toBe(1.0);

        // Epsilon coords (almost zero)
        const epsilonResult = calculateBioMetrics({
          currentHRV: 60,
          currentGSR: 5,
          birthLat: 35.6762,
          birthLon: 139.6503,
          currentLat: 0.000002,
          currentLon: -0.000001,
          elevation: 50,
          kpIndex: 3,
          solarTimeHours: 12,
          baseSyncDays: 5,
        });
        expect(epsilonResult.hardwareDisplacementPenalty).toBe(1.0);
      });

      it("should apply dynamic Bellman discount factor based on action type", async () => {
        const nba = new NBAEngine();

        // Define base state vector
        const state: NBAParams["stateVector"] = {
          ansLoad: 50,
          shieldCapacity: 50,
          environmentalNoise: "test",
          solarPhase: 120,
        };

        const result = await nba.getNextBestAction({ stateVector: state });

        // Verify discount factors in the logic trace:
        // Relocation actions should have gamma = 0.90
        const relocationTrace = result.logicTrace.find((t) =>
          t.includes("[BELLMAN] Q(EXECUTE_RELOCATION)"),
        );
        // Micro daily actions (like PREPARE_AND_WAIT) should have gamma = 0.50
        const microTrace = result.logicTrace.find((t) =>
          t.includes("[BELLMAN] Q(PREPARE_AND_WAIT)"),
        );

        expect(relocationTrace).toContain("γ*maxQ(S',A'): (0.9 *");
        expect(microTrace).toContain("γ*maxQ(S',A'): (0.5 *");
      });
    });
  });
});
