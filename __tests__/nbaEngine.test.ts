import { describe, it, expect } from "vitest";
import { NBAEngine, NBAParams } from "../src/utils/nbaEngine";

describe("NBAEngine Enhancements", () => {
  const engine = new NBAEngine();

  const mockBaseState: NBAParams["stateVector"] = {
    ansLoad: 30,
    shieldCapacity: 80,
    environmentalNoise: "Low",
    environmentalRisk: 40,
    solarPhase: 120,
    spaceWeather: {
      kpIndex: 2.0,
      xrayFlux: "A1.0",
      solarWindSpeed: 380,
      timestamp: "2026-06-12T12:00:00Z",
      riskScore: 20,
    },
    astrologyData: {
      source: "test",
      transits: ["TRINE", "SEXTILE"],
    },
    qiMenGate: {
      name: "生門",
      direction: "NE",
      description: "Life Gate",
      status: "Auspicious",
    },
    nineStarKi: {
      yearStar: 4,
      monthStar: 3,
      dayStar: 2,
    },
    isVoidTime: false,
    isConflictDay: false,
    isDoyouHazard: false,
  };

  it("should successfully encode state space layers", () => {
    const layers = engine.encodeStateLayers(mockBaseState);

    // Biometric Layer
    expect(layers.biometricDynamic.ansLoadNorm).toBe(0.3);
    expect(layers.biometricDynamic.shieldCapacityNorm).toBe(0.8);

    // Astrophysical Layer
    expect(layers.astrophysical.solarPhaseSin).toBeCloseTo(
      Math.sin((120 * Math.PI) / 180.0),
    );
    expect(layers.astrophysical.solarPhaseCos).toBeCloseTo(
      Math.cos((120 * Math.PI) / 180.0),
    );
    expect(layers.astrophysical.kpIndexNorm).toBe(2.0 / 9.0);

    // Metaphysical Layer
    expect(layers.metaphysical.qiMenGateScore).toBe(1.0);
    expect(layers.metaphysical.isVoidTime).toBe(0.0);
  });

  it("should apply Hierarchical RL constraint (prune relocation during Void Time)", async () => {
    const voidState = {
      ...mockBaseState,
      isVoidTime: true, // Triggers BLOCK_ACTIVE_RELOCATION
    };

    const result = await engine.getNextBestAction({ stateVector: voidState });

    // EXECUTE_RELOCATION and EXECUTE_PURGE_RELOCATION should be pruned to -999.0
    expect(result.qValues.EXECUTE_RELOCATION).toBe(-999.0);
    expect(result.qValues.EXECUTE_PURGE_RELOCATION).toBe(-999.0);

    // Selected action must be a safe option (e.g. PREPARE_AND_WAIT or ABORT_AND_SHIELD)
    expect(result.suggestedAction).not.toBe("EXECUTE_RELOCATION");
    expect(result.suggestedAction).not.toBe("EXECUTE_PURGE_RELOCATION");
    expect(result.macroAgentEvaluation.macroInstruction).toBe(
      "BLOCK_ACTIVE_RELOCATION",
    );
  });

  it("should adjust behavior based on positive closed-loop feedback", async () => {
    const baseResult = await engine.getNextBestAction({
      stateVector: mockBaseState,
      closedLoopFeedback: 0,
    });

    const positiveResult = await engine.getNextBestAction({
      stateVector: mockBaseState,
      closedLoopFeedback: 0.8, // Positive reward feedback
    });

    // Positive feedback lowers the decision temperature, making probabilities more confident/sharper
    expect(
      positiveResult.closedLoopRewardFeedback.adjustedTemperature,
    ).toBeLessThan(0.2);
    expect(positiveResult.confidence).toBeGreaterThanOrEqual(
      baseResult.confidence,
    );
  });

  it("should adjust behavior based on negative closed-loop feedback", async () => {
    const baseResult = await engine.getNextBestAction({
      stateVector: mockBaseState,
      closedLoopFeedback: 0,
    });

    const negativeResult = await engine.getNextBestAction({
      stateVector: mockBaseState,
      closedLoopFeedback: -0.6, // Negative reward feedback
    });

    // Negative feedback increases the temperature (explore safety actions)
    expect(
      negativeResult.closedLoopRewardFeedback.adjustedTemperature,
    ).toBeGreaterThan(0.2);
    // Relocation action Q-values should be penalized
    expect(
      negativeResult.closedLoopRewardFeedback.actionAdjustments
        .EXECUTE_RELOCATION,
    ).toBeLessThan(0);
    expect(
      negativeResult.closedLoopRewardFeedback.actionAdjustments
        .PREPARE_AND_WAIT,
    ).toBeGreaterThan(0);
  });

  it("should evaluate state correctly using nested temporal structures (current vs target ephemeris)", async () => {
    const nestedState: NBAParams["stateVector"] = {
      // Flat fallbacks that are wrong / different
      ansLoad: 90,
      shieldCapacity: 10,
      environmentalNoise: "Low",
      solarPhase: 80,
      spaceWeather: {
        kpIndex: 8.0, // high storm
        xrayFlux: "X1.0",
        solarWindSpeed: 900,
        timestamp: "2026-06-12T12:00:00Z",
        riskScore: 90,
      },
      isVoidTime: true,

      // Nested structures
      currentEphemeris: {
        date: "2026-06-12",
        solarPhase: 80,
        ansLoad: 30, // Good biometric load
        shieldCapacity: 85, // Good shield
        spaceWeather: {
          kpIndex: 1.0, // Quiet space weather
          xrayFlux: "A1.0",
          solarWindSpeed: 320,
          timestamp: "2026-06-12T12:00:00Z",
          riskScore: 10,
        },
      },
      targetEphemeris: {
        date: "2026-06-26",
        solarPhase: 95,
        isVoidTime: false, // Target day is NOT void time
        isConflictDay: false,
        isDoyouHazard: false,
        environmentalRisk: 10,
      },
    };

    const result = await engine.getNextBestAction({ stateVector: nestedState });

    // Since current biometrics are good (ansLoad: 30, shieldCapacity: 85) and target is not void (isVoidTime: false),
    // the relocation action should NOT be pruned (-999.0).
    expect(result.qValues.EXECUTE_RELOCATION).toBeGreaterThan(-999.0);
    // Since current space weather is good (kpIndex 1.0), the space risk in Q calculation should be low.
    // Relocation actions are highly favored under optimal biometrics and space weather, and amplified by dynamic gamma=0.90
    expect(result.suggestedAction).toBe("EXECUTE_PURGE_RELOCATION");
  });
});
