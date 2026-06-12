/**
 * Next Best Action (NBA) Engine
 * Uses Offline Reinforcement Learning (FQI) principles to suggest the optimal action based on current state.
 * Incorporates Sigmoid Activation Gates (Biological Stress/Vulnerability) and LLM Self-Attention Mimicry.
 */

export interface StateLayers {
  biometricDynamic: {
    ansLoadNorm: number;
    shieldCapacityNorm: number;
    stressLevelNorm: number;
    resilienceScore: number;
  };
  astrophysical: {
    solarPhaseSin: number;
    solarPhaseCos: number;
    kpIndexNorm: number;
    solarWindSpeedNorm: number;
    aspectsRiskScore: number;
  };
  metaphysical: {
    qiMenGateScore: number;
    isVoidTime: number;
    isConflictDay: number;
    isDoyouHazard: number;
    nineStarKiWeight: number;
  };
}

export interface NBAParams {
  stateVector: {
    // Legacy flat fields for backward compatibility
    ansLoad: number; // 0-100
    shieldCapacity: number; // 0-100
    environmentalNoise: string;
    environmentalRisk?: number; // 0-100 (Inferred macro risk)
    solarPhase: number; // 0-360 degrees
    stressLevel?: number; // 0-100
    resilience?: string; // e.g. 'adequate'
    isVoidTime?: boolean;
    isConflictDay?: boolean;
    isDoyouHazard?: boolean;
    unifiedRiskScore?: number;
    // --- Enriched Data Streams ---
    ephemerisData?: {
      source: string;
      planetaryPositions: any;
    };
    astrologyData?: {
      source: string;
      transits: any;
      retrogrades?: string[];
    };
    ragContext?: {
      source: string;
      classicalRules: any;
      personalBazi?: any;
    };
    vedicAstrology?: {
      nakshatra: string;
      moonProgress?: number;
      sunNakshatra?: string;
      sunProgress?: number;
      tithi: string;
      ayanamsa?: string;
    };
    ichingHexagram?: {
      number: number;
      name: string;
      riskModifier: number;
      confidenceBoost: number;
      actionAdvice: string;
    };
    tendoDirection?: string;
    qiMenGate?: {
      name: string;
      direction: string;
      description: string;
      status: "Auspicious" | "Inauspicious" | "Neutral";
    };
    nineStarKi?: {
      yearStar: number;
      monthStar: number;
      dayStar: number;
    };
    spaceWeather?: {
      kpIndex: number | null;
      xrayFlux: string | null;
      solarWindSpeed: number | null;
      timestamp: string | null;
      riskScore: number;
    };

    // --- Proposal 1: Temporal Anchoring (Nested Structures) ---
    currentEphemeris?: {
      date: string;
      solarPhase: number;
      vedicAstrology?: {
        nakshatra: string;
        moonProgress?: number;
        sunNakshatra?: string;
        sunProgress?: number;
        tithi: string;
        ayanamsa?: string;
      };
      spaceWeather?: {
        kpIndex: number | null;
        xrayFlux: string | null;
        solarWindSpeed: number | null;
        timestamp: string | null;
        riskScore: number;
      };
      ansLoad: number;
      shieldCapacity: number;
      stressLevel?: number;
      resilience?: string;
    };
    targetEphemeris?: {
      date: string;
      solarPhase: number;
      isVoidTime: boolean;
      isConflictDay: boolean;
      isDoyouHazard: boolean;
      environmentalRisk?: number;
      nineStarKi?: {
        yearStar: number;
        monthStar: number;
        dayStar: number;
      };
      qiMenGate?: {
        name: string;
        direction: string;
        description: string;
        status: "Auspicious" | "Inauspicious" | "Neutral";
      };
      vedicAstrology?: {
        nakshatra: string;
        moonProgress?: number;
        sunNakshatra?: string;
        sunProgress?: number;
        tithi: string;
        ayanamsa?: string;
      };
      ephemerisData?: {
        source: string;
        planetaryPositions: any;
      };
      astrologyData?: {
        source: string;
        transits: any;
        retrogrades?: string[];
      };
      ragContext?: {
        source: string;
        classicalRules: any;
        personalBazi?: any;
      };
      ichingHexagram?: {
        number: number;
        name: string;
        riskModifier: number;
        confidenceBoost: number;
        actionAdvice: string;
      };
    };
  };
  closedLoopFeedback?: number; // Proposed closed-loop reward delta (-1.0 to 1.0)
}

// Pre-defined Actions in our Markov Decision Process (Relocation Context)
export type ActionType =
  | "EXECUTE_RELOCATION"
  | "EXECUTE_PURGE_RELOCATION"
  | "PREPARE_AND_WAIT"
  | "GATHER_INTEL"
  | "ABORT_AND_SHIELD";

interface QWeights {
  w_ans: number;
  w_shield: number;
  w_risk: number;
  w_solar: number;
  w_vedic: number;
  w_ephem: number;
  w_astro: number;
  w_rag: number;
  w_personal: number;
  bias: number;
}

// Weights mimicking a trained policy matrix (W^T * X + B)
const PolicyWeights: Record<ActionType, QWeights> = {
  EXECUTE_RELOCATION: {
    w_ans: -0.4,
    w_shield: 0.8,
    w_risk: -0.8,
    w_solar: 0.3,
    w_vedic: 0.5,
    w_ephem: 0.4,
    w_astro: 0.6,
    w_rag: 0.5,
    w_personal: 1.0,
    bias: -0.2,
  },
  EXECUTE_PURGE_RELOCATION: {
    w_ans: -0.2,
    w_shield: 1.0,
    w_risk: -0.4,
    w_solar: 0.2,
    w_vedic: 0.3,
    w_ephem: 0.2,
    w_astro: 0.4,
    w_rag: 0.3,
    w_personal: 0.5,
    bias: -0.5,
  },
  PREPARE_AND_WAIT: {
    w_ans: 0.3,
    w_shield: -0.2,
    w_risk: 0.4,
    w_solar: -0.2,
    w_vedic: -0.4,
    w_ephem: -0.3,
    w_astro: -0.2,
    w_rag: -0.3,
    w_personal: 0.2,
    bias: 0.5,
  },
  GATHER_INTEL: {
    w_ans: -0.1,
    w_shield: 0.4,
    w_risk: 0.0,
    w_solar: 0.1,
    w_vedic: 0.1,
    w_ephem: 0.2,
    w_astro: 0.2,
    w_rag: 0.1,
    w_personal: 0.1,
    bias: 0.3,
  },
  ABORT_AND_SHIELD: {
    w_ans: 0.8,
    w_shield: -0.7,
    w_risk: 0.9,
    w_solar: 0.0,
    w_vedic: -0.5,
    w_ephem: -0.8,
    w_astro: -0.8,
    w_rag: -0.6,
    w_personal: -1.0,
    bias: 0.0,
  },
};

export function sigmoid(x: number, k: number = 10, x0: number = 0.5): number {
  return 1 / (1 + Math.exp(-k * (x - x0)));
}

function calculateMarsSaturnAspectScore(mars: number, saturn: number): number {
  let diff = Math.abs(mars - saturn) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  if (diff <= 8) return -0.8;
  if (Math.abs(diff - 90) <= 8) return -0.8;
  if (Math.abs(diff - 180) <= 8) return -0.8;

  if (Math.abs(diff - 60) <= 6) return 0.6;
  if (Math.abs(diff - 120) <= 8) return 0.6;

  return 0.0;
}

export function calculateAspectWeight(currentOrb: number, maxOrb: number): number {
  if (currentOrb >= maxOrb) return 0.0;
  return Math.cos((currentOrb / maxOrb) * (Math.PI / 2));
}

function getAspectsScoresFromTransits(
  transits: string[],
  retrogrades: string[] = [],
): { hardWeight: number; softWeight: number } {
  let hardWeight = 0;
  let softWeight = 0;

  const retrogradesUpper = retrogrades.map((r) => r.toUpperCase());

  for (const t of transits) {
    const tUpper = t.toUpperCase();
    const isHard = tUpper.includes("SQUARE") || tUpper.includes("OPPOSITION");
    const isSoft = tUpper.includes("TRINE") || tUpper.includes("SEXTILE");

    if (isHard || isSoft) {
      const orbMatch = tUpper.match(/ORB:\s*([0-9.]+)/);
      const orb = orbMatch ? parseFloat(orbMatch[1]) : 2.5;

      // Apply a 0.8 decay multiplier per retrograde celestial body involved in the transit aspect
      let multiplier = 1.0;
      for (const rUpper of retrogradesUpper) {
        if (tUpper.includes(rUpper)) {
          multiplier *= 0.8;
        }
      }

      const weight = calculateAspectWeight(orb, 5.0) * multiplier;

      if (isHard) {
        hardWeight += weight;
      } else {
        softWeight += weight;
      }
    }
  }

  return { hardWeight, softWeight };
}

export class NBAEngine {
  /**
   * Encodes the flat state vector into three distinct sub-states (layers)
   * with custom normalization, scaling, and trigonometric/cyclical mapping.
   * Leverages temporal anchoring nested scopes when provided.
   */
  public encodeStateLayers(state: any): StateLayers {
    const current = state.currentEphemeris ?? state;
    const target = state.targetEphemeris ?? state;

    // --- Layer 1: Biometric & Dynamic Physical State (Execution Date) ---
    const ansLoadNorm = (current.ansLoad ?? 50) / 100.0;
    const shieldCapacityNorm = (current.shieldCapacity ?? 50) / 100.0;
    const stressLevelNorm = (current.stressLevel ?? current.ansLoad ?? 50) / 100.0;
    
    let resilienceScore = 0.5;
    if (current.resilience) {
      const r = String(current.resilience).toLowerCase();
      if (r === "high" || r === "strong" || r === "optimal") resilienceScore = 1.0;
      else if (r === "adequate" || r === "normal") resilienceScore = 0.6;
      else if (r === "low" || r === "weak" || r === "vulnerable") resilienceScore = 0.2;
    }

    // --- Layer 2: Astrophysical & Space Weather State (Target Date for orbits, Execution Date for weather) ---
    const solarPhaseRad = ((target.solarPhase ?? 0) * Math.PI) / 180.0;
    const solarPhaseSin = Math.sin(solarPhaseRad);
    const solarPhaseCos = Math.cos(solarPhaseRad);

    const spaceWeatherSource = current.spaceWeather ?? target.spaceWeather ?? state.spaceWeather;
    const kpVal = spaceWeatherSource?.kpIndex ?? 3.0;
    const kpIndexNorm = kpVal / 9.0;

    const windSpeedVal = spaceWeatherSource?.solarWindSpeed ?? 400;
    const solarWindSpeedNorm = Math.max(0, Math.min(1.0, (windSpeedVal - 300) / 500));

    const astrologySource = target.astrologyData ?? state.astrologyData;
    let aspectsRiskScore = (target.environmentalRisk ?? state.environmentalRisk ?? 50) / 100.0;
    if (astrologySource?.transits && Array.isArray(astrologySource.transits)) {
      const { hardWeight, softWeight } = getAspectsScoresFromTransits(
        astrologySource.transits,
        astrologySource.retrogrades ?? [],
      );
      aspectsRiskScore = Math.max(0, Math.min(1.0, aspectsRiskScore + (hardWeight * 0.1) - (softWeight * 0.05)));
    }

    // --- Layer 3: Metaphysical & Calendrical State (Target Date) ---
    const qiMenGateSource = target.qiMenGate ?? state.qiMenGate;
    let qiMenGateScore = 0.0;
    if (qiMenGateSource) {
      if (qiMenGateSource.status === "Auspicious") qiMenGateScore = 1.0;
      else if (qiMenGateSource.status === "Inauspicious") qiMenGateScore = -1.0;
    }

    const isVoidTime = (target.isVoidTime ?? state.isVoidTime) ? 1.0 : 0.0;
    const isConflictDay = (target.isConflictDay ?? state.isConflictDay) ? 1.0 : 0.0;
    const isDoyouHazard = (target.isDoyouHazard ?? state.isDoyouHazard) ? 1.0 : 0.0;

    const nineStarKiSource = target.nineStarKi ?? state.nineStarKi;
    const yStar = nineStarKiSource?.yearStar ?? 5;
    const mStar = nineStarKiSource?.monthStar ?? 5;
    const dStar = nineStarKiSource?.dayStar ?? 5;
    const nineStarKiWeight = (yStar + mStar + dStar) / 27.0;

    return {
      biometricDynamic: {
        ansLoadNorm,
        shieldCapacityNorm,
        stressLevelNorm,
        resilienceScore,
      },
      astrophysical: {
        solarPhaseSin,
        solarPhaseCos,
        kpIndexNorm,
        solarWindSpeedNorm,
        aspectsRiskScore,
      },
      metaphysical: {
        qiMenGateScore,
        isVoidTime,
        isConflictDay,
        isDoyouHazard,
        nineStarKiWeight,
      },
    };
  }

  /**
   * Helper to calculate the static Q-value for a given state vector and action.
   * Incorporates Action-Type Weighting, Sigmoid Gates, Attention adjustments, and HRL constraints.
   */
  private evaluateStateStatic(
    state: any,
    action: ActionType,
    attentionRiskAdjustment: number = 0,
    encodedLayers: StateLayers,
    macroInstruction: "BLOCK_ACTIVE_RELOCATION" | "FAVOR_PREPARATION" | "PERMIT_ALL" = "PERMIT_ALL",
  ): number {
    const target = state.targetEphemeris ?? state;

    const {
      unifiedRiskScore,
      tendoDirection,
      qiMenGate,
      vedicAstrology,
      ephemerisData,
      astrologyData,
      ragContext,
    } = target;

    const f1_ans = encodedLayers.biometricDynamic.ansLoadNorm;
    const f2_shield = encodedLayers.biometricDynamic.shieldCapacityNorm;
    const f3_risk = encodedLayers.astrophysical.aspectsRiskScore;
    const f4_solar = encodedLayers.astrophysical.solarPhaseCos;

    let f5_vedic = 0;
    if (vedicAstrology && vedicAstrology.tithi) {
      const match = String(vedicAstrology.tithi).match(/\d+/);
      if (match) {
        const tithiNum = parseInt(match[0], 10);
        const tithiPhase = (tithiNum - 1) / 30;
        f5_vedic = -Math.cos(tithiPhase * 2 * Math.PI);
        if (vedicAstrology.moonProgress !== undefined) {
          f5_vedic += (vedicAstrology.moonProgress - 0.5) * 0.2;
          f5_vedic = Math.max(-1.0, Math.min(1.0, f5_vedic));
        }
      }
    }

    let f6_ephem = 0;
    if (ephemerisData && ephemerisData.planetaryPositions) {
      const mars = parseFloat(ephemerisData.planetaryPositions.mars);
      const saturn = parseFloat(ephemerisData.planetaryPositions.saturn);
      if (!isNaN(mars) && !isNaN(saturn)) {
        f6_ephem = calculateMarsSaturnAspectScore(mars, saturn);
      }
    }

    let f7_astro = 0;
    if (
      astrologyData &&
      astrologyData.transits &&
      Array.isArray(astrologyData.transits)
    ) {
      const { hardWeight, softWeight } = getAspectsScoresFromTransits(
        astrologyData.transits,
        astrologyData.retrogrades ?? [],
      );
      f7_astro = (softWeight - hardWeight) * 0.25;
      f7_astro = Math.max(-1.0, Math.min(1.0, f7_astro));
    }

    let f8_rag = 0;
    if (ragContext && ragContext.classicalRules) {
      const rules = JSON.stringify(ragContext.classicalRules);
      const strong = (rules.match(/[辰寅午]/g) || []).length;
      const stable = (rules.match(/[丑卯未]/g) || []).length;
      f8_rag = (strong - stable) * 0.3;
      f8_rag = Math.max(-1.0, Math.min(1.0, f8_rag));
    }

    let f9_personal = 0;
    let voidPenalty = 0;
    let compatibilityScore = 0;

    if (ragContext && ragContext.personalBazi) {
      const personalBazi = ragContext.personalBazi;
      const envBazi = ragContext.classicalRules;

      if (personalBazi.voidZodiac && envBazi && envBazi.pillars) {
        const voidZodiac = personalBazi.voidZodiac;
        const currentYearZhi = envBazi.pillars.year?.zhi;
        const currentMonthZhi = envBazi.pillars.month?.zhi;
        const currentDayZhi = envBazi.pillars.day?.zhi;

        let voidLevel = 0;
        if (currentYearZhi && voidZodiac.includes(currentYearZhi)) {
          voidLevel += 0.5;
        }
        if (currentMonthZhi && voidZodiac.includes(currentMonthZhi)) {
          voidLevel += 0.3;
        }
        if (currentDayZhi && voidZodiac.includes(currentDayZhi)) {
          voidLevel += 0.2;
        }

        if (voidLevel > 0) {
          voidPenalty = -voidLevel;
        }
      }

      if (
        personalBazi.summary?.dayMasterWuxing &&
        envBazi?.summary?.dayMasterWuxing
      ) {
        const pm = personalBazi.summary.dayMasterWuxing;
        const em = envBazi.summary.dayMasterWuxing;
        const shengCycle: Record<string, string> = {
          木: "火",
          火: "土",
          土: "金",
          金: "水",
          水: "木",
        };
        const keCycle: Record<string, string> = {
          木: "土",
          土: "水",
          水: "火",
          火: "金",
          金: "木",
        };

        const strength = personalBazi.summary?.strength || "中庸";
        const isWeak = strength === "身弱" || strength === "極弱";

        if (pm === em) {
          compatibilityScore = 0.2;
        } else if (shengCycle[pm] === em) {
          // User generates Environment (泄気)
          if (isWeak) {
            compatibilityScore = -0.5; // Draining energy is a penalty for weak Day Master
          } else {
            compatibilityScore = 0.5;  // Venting energy is a bonus for strong/balanced
          }
        } else if (shengCycle[em] === pm) {
          compatibilityScore = 0.8;
        } else if (keCycle[pm] === em) {
          const isActive =
            action === "EXECUTE_RELOCATION" ||
            action === "EXECUTE_PURGE_RELOCATION" ||
            action === "GATHER_INTEL";
          compatibilityScore = isActive ? 0.4 : 0.1;
        } else if (keCycle[em] === pm) {
          const isActive =
            action === "EXECUTE_RELOCATION" ||
            action === "EXECUTE_PURGE_RELOCATION" ||
            action === "GATHER_INTEL";
          compatibilityScore = isActive ? -0.5 : 0.6;
        } else {
          compatibilityScore = -0.3;
        }
      }

      f9_personal = voidPenalty !== 0 ? voidPenalty : compatibilityScore;
      f9_personal = Math.max(-1.0, Math.min(1.0, f9_personal));
    }

    // Action-Type Weighting
    const W = PolicyWeights[action];
    let w_rag = W.w_rag;
    let w_personal = W.w_personal;

    if (action === "EXECUTE_RELOCATION" || action === "GATHER_INTEL") {
      w_rag = 0.7;
      w_personal = 0.3;
    } else if (action === "EXECUTE_PURGE_RELOCATION") {
      w_rag = 0.4;
      w_personal = 0.6;
    } else if (action === "PREPARE_AND_WAIT" || action === "ABORT_AND_SHIELD") {
      w_rag = 0.2;
      w_personal = -0.8;
    }

    // Qimen Dunjia & Kigaku Switch
    let combinedClassical = f8_rag;
    if (qiMenGate) {
      const qiMenScore = encodedLayers.metaphysical.qiMenGateScore;
      if (action === "EXECUTE_RELOCATION") {
        combinedClassical = f8_rag * 0.8 + qiMenScore * 0.2;
      } else if (action === "EXECUTE_PURGE_RELOCATION") {
        combinedClassical = f8_rag * 0.5 + qiMenScore * 0.5;
      } else if (action === "GATHER_INTEL") {
        combinedClassical = f8_rag * 0.2 + qiMenScore * 0.8;
      } else {
        combinedClassical = f8_rag * 0.5 + qiMenScore * 0.5;
      }
    }

    // 1. Core Q-value regression
    let q =
      W.w_ans * f1_ans +
      W.w_shield * f2_shield +
      W.w_risk * f3_risk +
      W.w_solar * f4_solar +
      W.w_vedic * f5_vedic +
      W.w_ephem * f6_ephem +
      W.w_astro * f7_astro +
      w_rag * combinedClassical +
      w_personal * f9_personal +
      W.bias;

    // 2. Apply Sigmoid Activation Gates
    const ansStressGate = sigmoid(f1_ans, 12, 0.65);
    const shieldVulnerabilityGate = sigmoid(1.0 - f2_shield, 10, 0.7);

    const stressPenalty = ansStressGate * 0.8;
    const vulnerabilityPenalty = shieldVulnerabilityGate * 0.9;

    if (
      action === "EXECUTE_RELOCATION" ||
      action === "EXECUTE_PURGE_RELOCATION" ||
      action === "GATHER_INTEL"
    ) {
      q -= stressPenalty + vulnerabilityPenalty + attentionRiskAdjustment;
    } else if (action === "ABORT_AND_SHIELD" || action === "PREPARE_AND_WAIT") {
      q += (stressPenalty + vulnerabilityPenalty) * 0.5;
    }

    // Time-Gate Risk triggers (Micro-level)
    const hasRiskTrigger =
      encodedLayers.metaphysical.isVoidTime > 0 ||
      encodedLayers.metaphysical.isConflictDay > 0 ||
      (unifiedRiskScore !== undefined && unifiedRiskScore >= 60);
    let riskModifier = 0;
    if (hasRiskTrigger) {
      if (action === "EXECUTE_RELOCATION" || action === "GATHER_INTEL") {
        riskModifier = -0.5;
      } else if (action === "EXECUTE_PURGE_RELOCATION") {
        const hasExternalClash =
          encodedLayers.metaphysical.isConflictDay > 0 ||
          (unifiedRiskScore !== undefined && unifiedRiskScore >= 60);
        riskModifier = hasExternalClash ? -0.5 : 0.0;
      } else if (
        action === "ABORT_AND_SHIELD" ||
        action === "PREPARE_AND_WAIT"
      ) {
        riskModifier = 0.5;
      }
      q += riskModifier;
    }

    // Redirect Tendo energy to boost defensive Q-values during Void Time (天中殺)
    if (tendoDirection && encodedLayers.metaphysical.isVoidTime > 0) {
      if (action === "PREPARE_AND_WAIT" || action === "ABORT_AND_SHIELD") {
        q += 0.3;
      }
    }

    // Doyou Hazard penalty
    if (encodedLayers.metaphysical.isDoyouHazard > 0) {
      if (
        action === "EXECUTE_RELOCATION" ||
        action === "EXECUTE_PURGE_RELOCATION"
      ) {
        q += -0.6;
      } else if (
        action === "PREPARE_AND_WAIT" ||
        action === "ABORT_AND_SHIELD"
      ) {
        q += 0.4;
      }
    }

    // --- Apply Hierarchical Reinforcement Learning constraints and biases ---
    if (macroInstruction === "BLOCK_ACTIVE_RELOCATION") {
      if (action === "EXECUTE_RELOCATION" || action === "EXECUTE_PURGE_RELOCATION") {
        q = -999.0;
      }
    } else if (macroInstruction === "FAVOR_PREPARATION") {
      if (action === "PREPARE_AND_WAIT" || action === "GATHER_INTEL") {
        q += 0.3;
      } else if (action === "EXECUTE_RELOCATION" || action === "EXECUTE_PURGE_RELOCATION") {
        q -= 0.4;
      }
    }

    return q;
  }

  /**
   * Evaluates the current state vector using a deterministic Q-value heuristic with Fitted Q-Iteration principles.
   * Enriched with Layered State Space encoding, Hierarchical RL routing, and Closed-loop feedback.
   */
  async getNextBestAction(params: NBAParams) {
    const state = params.stateVector;
    const closedLoopFeedback = params.closedLoopFeedback ?? 0;

    // Anchors for nested parameters
    const current = state.currentEphemeris ?? state;
    const target = state.targetEphemeris ?? state;

    // 1. Encode state space layers (Proposal A)
    const encodedLayers = this.encodeStateLayers(state);

    const f1_ans = encodedLayers.biometricDynamic.ansLoadNorm;
    const f2_shield = encodedLayers.biometricDynamic.shieldCapacityNorm;
    const f3_risk = encodedLayers.astrophysical.aspectsRiskScore;
    const f4_solar = encodedLayers.astrophysical.solarPhaseCos;

    // Derived classical features for legacy alignment (pulled from target)
    const { vedicAstrology, ephemerisData, astrologyData, ragContext } = target;
    
    let f5_vedic = 0;
    if (vedicAstrology && vedicAstrology.tithi) {
      const match = String(vedicAstrology.tithi).match(/\d+/);
      if (match) {
        const tithiNum = parseInt(match[0], 10);
        const tithiPhase = (tithiNum - 1) / 30;
        f5_vedic = -Math.cos(tithiPhase * 2 * Math.PI);
        if (vedicAstrology.moonProgress !== undefined) {
          f5_vedic += (vedicAstrology.moonProgress - 0.5) * 0.2;
          f5_vedic = Math.max(-1.0, Math.min(1.0, f5_vedic));
        }
      }
    }

    let f6_ephem = 0;
    if (ephemerisData && ephemerisData.planetaryPositions) {
      const mars = parseFloat(ephemerisData.planetaryPositions.mars);
      const saturn = parseFloat(ephemerisData.planetaryPositions.saturn);
      if (!isNaN(mars) && !isNaN(saturn)) {
        f6_ephem = calculateMarsSaturnAspectScore(mars, saturn);
      }
    }

    let f7_astro = 0;
    if (
      astrologyData &&
      astrologyData.transits &&
      Array.isArray(astrologyData.transits)
    ) {
      const { hardWeight, softWeight } = getAspectsScoresFromTransits(
        astrologyData.transits,
        astrologyData.retrogrades ?? [],
      );
      f7_astro = (softWeight - hardWeight) * 0.25;
      f7_astro = Math.max(-1.0, Math.min(1.0, f7_astro));
    }

    let f8_rag = 0;
    if (ragContext && ragContext.classicalRules) {
      const rules = JSON.stringify(ragContext.classicalRules);
      const strong = (rules.match(/[辰寅午]/g) || []).length;
      const stable = (rules.match(/[丑卯未]/g) || []).length;
      f8_rag = (strong - stable) * 0.3;
      f8_rag = Math.max(-1.0, Math.min(1.0, f8_rag));
    }

    let f9_personal = 0;
    let voidPenalty = 0;
    let compatibilityScore = 0;
    let personalLog = "";

    if (ragContext && ragContext.personalBazi) {
      const personalBazi = ragContext.personalBazi;
      const envBazi = ragContext.classicalRules;

      if (personalBazi.voidZodiac && envBazi && envBazi.pillars) {
        const voidZodiac = personalBazi.voidZodiac;
        const currentYearZhi = envBazi.pillars.year?.zhi;
        const currentMonthZhi = envBazi.pillars.month?.zhi;
        const currentDayZhi = envBazi.pillars.day?.zhi;

        let voidLevel = 0;
        const voidSources = [];
        if (currentYearZhi && voidZodiac.includes(currentYearZhi)) {
          voidLevel += 0.5;
          voidSources.push("Year");
        }
        if (currentMonthZhi && voidZodiac.includes(currentMonthZhi)) {
          voidLevel += 0.3;
          voidSources.push("Month");
        }
        if (currentDayZhi && voidZodiac.includes(currentDayZhi)) {
          voidLevel += 0.2;
          voidSources.push("Day");
        }

        if (voidLevel > 0) {
          voidPenalty = -voidLevel;
          personalLog += `Void detected (${voidSources.join(", ")}) Penalty: ${voidPenalty.toFixed(2)}. `;
        }
      }

      if (
        personalBazi.summary?.dayMasterWuxing &&
        envBazi?.summary?.dayMasterWuxing
      ) {
        const pm = personalBazi.summary.dayMasterWuxing;
        const em = envBazi.summary.dayMasterWuxing;
        const shengCycle: Record<string, string> = {
          木: "火",
          火: "土",
          土: "金",
          金: "水",
          水: "木",
        };
        const keCycle: Record<string, string> = {
          木: "土",
          土: "水",
          水: "火",
          火: "金",
          金: "木",
        };

        const strength = personalBazi.summary?.strength || "中庸";
        const isWeak = strength === "身弱" || strength === "極弱";

        if (pm === em) {
          compatibilityScore = 0.2;
          personalLog += `Compatibility: Same Element (+0.2). `;
        } else if (shengCycle[pm] === em) {
          // User generates Environment (泄気)
          if (isWeak) {
            compatibilityScore = -0.5;
            personalLog += `Compatibility: Draining (You generate weak Env) (-0.5). `;
          } else {
            compatibilityScore = 0.5;
            personalLog += `Compatibility: You generate Env (+0.5). `;
          }
        } else if (shengCycle[em] === pm) {
          compatibilityScore = 0.8;
          personalLog += `Compatibility: Env generates You (+0.8). `;
        } else if (keCycle[pm] === em) {
          compatibilityScore = 0.4;
          personalLog += `Compatibility: You control Env (Wealth 才/財) (+0.4 active / +0.1 passive). `;
        } else if (keCycle[em] === pm) {
          compatibilityScore = -0.5;
          personalLog += `Compatibility: Env controls You (Officer 官/殺) (-0.5 active / +0.6 passive). `;
        } else {
          compatibilityScore = -0.3;
          personalLog += `Compatibility: Controlling/Conflict (-0.3). `;
        }
      }

      f9_personal = voidPenalty !== 0 ? voidPenalty : compatibilityScore;
      f9_personal = Math.max(-1.0, Math.min(1.0, f9_personal));
    }

    // --- LLM Self-Attention Mimicry Block ---
    const q_honmei =
      (target.ragContext?.personalBazi?.honmeiStar?.physical || 5) / 9.0;
    const q_getsumei =
      (target.ragContext?.personalBazi?.honmeiStar?.classical || 5) / 9.0;
    const q_daymaster = f9_personal;
    const queries = [q_honmei, q_getsumei, q_daymaster];

    const nineStarKiSource = target.nineStarKi ?? state.nineStarKi;
    const k_year = (nineStarKiSource?.yearStar || 5) / 9.0;
    const k_month = (nineStarKiSource?.monthStar || 5) / 9.0;
    const k_day = (nineStarKiSource?.dayStar || 5) / 9.0;
    const k_lunar = f5_vedic;

    const spaceWeatherSource = current.spaceWeather ?? state.spaceWeather;
    const k_space = (spaceWeatherSource?.kpIndex || 3.0) / 9.0;
    const k_vix = f3_risk;
    const keys = [k_year, k_month, k_day, k_lunar, k_space, k_vix];

    const attentionMatrix: number[][] = [];
    const d_k = 3.0;

    for (let i = 0; i < queries.length; i++) {
      const rowScores = keys.map((k) => (queries[i] * k) / Math.sqrt(d_k));
      const expScores = rowScores.map((s) => Math.exp(s));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const rowWeights = expScores.map((es) => es / (sumExp || 1.0));
      attentionMatrix.push(rowWeights);
    }

    const dmToRiskAttention = attentionMatrix[2][5] || 0.16;
    const attentionRiskAdjustment = dmToRiskAttention * f3_risk * 0.2;

    const ansStressGate = sigmoid(f1_ans, 12, 0.65);
    const shieldVulnerabilityGate = sigmoid(1.0 - f2_shield, 10, 0.7);

    // --- Proposal B: Hierarchical Reinforcement Learning (HRL) ---
    // Macro Agent operates on year/month slow-moving horizons.
    const macroRiskFactor = (encodedLayers.astrophysical.aspectsRiskScore * 0.4) + (encodedLayers.metaphysical.isVoidTime * 0.6);
    let macroInstruction: "BLOCK_ACTIVE_RELOCATION" | "FAVOR_PREPARATION" | "PERMIT_ALL" = "PERMIT_ALL";
    if (encodedLayers.metaphysical.isVoidTime > 0 || macroRiskFactor > 0.75) {
      macroInstruction = "BLOCK_ACTIVE_RELOCATION";
    } else if (macroRiskFactor > 0.45) {
      macroInstruction = "FAVOR_PREPARATION";
    }

    const macroQValues = {
      EXECUTE_RELOCATION: -1.0 * encodedLayers.metaphysical.isVoidTime - 0.4 * encodedLayers.astrophysical.aspectsRiskScore,
      EXECUTE_PURGE_RELOCATION: -1.5 * encodedLayers.metaphysical.isVoidTime - 0.6 * encodedLayers.astrophysical.aspectsRiskScore,
      PREPARE_AND_WAIT: 0.5 * encodedLayers.metaphysical.isVoidTime + 0.3 * encodedLayers.astrophysical.aspectsRiskScore + 0.2,
    };

    // --- Proposal D: Closed-Loop Reward Feedback Adjustments ---
    let temperature = 0.2;
    const actionAdjustments: Record<ActionType, number> = {
      EXECUTE_RELOCATION: 0,
      EXECUTE_PURGE_RELOCATION: 0,
      PREPARE_AND_WAIT: 0,
      GATHER_INTEL: 0,
      ABORT_AND_SHIELD: 0,
    };

    if (closedLoopFeedback !== 0) {
      if (closedLoopFeedback < 0) {
        temperature += Math.abs(closedLoopFeedback) * 0.15;
        actionAdjustments.EXECUTE_RELOCATION = -0.5 * Math.abs(closedLoopFeedback);
        actionAdjustments.EXECUTE_PURGE_RELOCATION = -0.8 * Math.abs(closedLoopFeedback);
        actionAdjustments.ABORT_AND_SHIELD = 0.4 * Math.abs(closedLoopFeedback);
        actionAdjustments.PREPARE_AND_WAIT = 0.3 * Math.abs(closedLoopFeedback);
      } else {
        temperature = Math.max(0.05, temperature - closedLoopFeedback * 0.05);
      }
    }

    const logicTrace: string[] = [];
    logicTrace.push(
      `[INIT] Features: ANS=${f1_ans.toFixed(2)}, SHIELD=${f2_shield.toFixed(2)}, RISK=${f3_risk.toFixed(2)}, SOLAR=${f4_solar.toFixed(2)}, VEDIC=${f5_vedic.toFixed(2)}, EPHEM=${f6_ephem.toFixed(2)}, ASTRO=${f7_astro.toFixed(2)}, RAG=${f8_rag.toFixed(2)}, PERSONAL=${f9_personal.toFixed(2)}`,
    );
    logicTrace.push(
      `[HRL] Macro-Agent State: RiskFactor=${macroRiskFactor.toFixed(2)}, Instruction=${macroInstruction}.`,
    );
    if (closedLoopFeedback !== 0) {
      logicTrace.push(
        `[CLOSED-LOOP] Biometric Feedback applied: RewardDelta=${closedLoopFeedback > 0 ? "+" : ""}${closedLoopFeedback.toFixed(2)}. Adjusted Temperature: ${temperature.toFixed(2)}.`,
      );
    }
    if (personalLog) {
      logicTrace.push(`[PERSONAL] ${personalLog.trim()}`);
    }
    if (target.ichingHexagram) {
      logicTrace.push(
        `[MODIFIER] I-Ching Hexagram ${target.ichingHexagram.number} applied: Risk Modifier ${target.ichingHexagram.riskModifier > 0 ? "+" : ""}${target.ichingHexagram.riskModifier}, Confidence Boost ${target.ichingHexagram.confidenceBoost > 0 ? "+" : ""}${target.ichingHexagram.confidenceBoost}`,
      );
    }
    if (target.isDoyouHazard) {
      logicTrace.push(
        `[DOYOU] Active Doyou Hazard (土用殺) detected. Restricting active/purge relocation actions.`,
      );
    }

    const qValues: Record<ActionType, number> = {} as any;
    const actions = Object.keys(PolicyWeights) as ActionType[];

    let maxQ = -Infinity;
    let bestAction: ActionType = "PREPARE_AND_WAIT";

    for (const action of actions) {
      // Apply Macro Agent hard constraint
      if (macroInstruction === "BLOCK_ACTIVE_RELOCATION" && 
          (action === "EXECUTE_RELOCATION" || action === "EXECUTE_PURGE_RELOCATION")) {
        const prunedQ = -999.0;
        qValues[action] = prunedQ;
        logicTrace.push(
          `[HRL-CONSTRAINT] Action ${action} is pruned due to active Void Time / High Macro Risk. Q = ${prunedQ.toFixed(1)}`,
        );
        continue;
      }

      // Calculate static immediate reward R(S, A) with Sigmoid gates, HRL constraints, and Attention adjustments
      let currentQStatic = this.evaluateStateStatic(
        state,
        action,
        attentionRiskAdjustment,
        encodedLayers,
        macroInstruction,
      );

      // Apply closed-loop biometric feedback adjustments
      if (actionAdjustments[action] !== 0) {
        currentQStatic += actionAdjustments[action];
      }

      // Predict next state S' (FQI transition modeling)
      const nextState = { ...state };
      if (state.currentEphemeris) {
        const nextCurrent = { ...state.currentEphemeris };
        if (action === "PREPARE_AND_WAIT") {
          nextCurrent.ansLoad = Math.max(0, (state.currentEphemeris.ansLoad ?? 50) - 10);
          nextCurrent.shieldCapacity = Math.min(100, (state.currentEphemeris.shieldCapacity ?? 50) + 5);
        } else if (action === "ABORT_AND_SHIELD") {
          nextCurrent.ansLoad = Math.max(0, (state.currentEphemeris.ansLoad ?? 50) - 15);
          nextCurrent.shieldCapacity = Math.min(100, (state.currentEphemeris.shieldCapacity ?? 50) + 10);
        } else if (action === "EXECUTE_RELOCATION") {
          nextCurrent.ansLoad = Math.min(100, (state.currentEphemeris.ansLoad ?? 50) + 20);
          nextCurrent.shieldCapacity = Math.max(0, (state.currentEphemeris.shieldCapacity ?? 50) - 15);
        } else if (action === "EXECUTE_PURGE_RELOCATION") {
          nextCurrent.ansLoad = Math.min(100, (state.currentEphemeris.ansLoad ?? 50) + 30);
          nextCurrent.shieldCapacity = Math.max(0, (state.currentEphemeris.shieldCapacity ?? 50) - 40);
        } else if (action === "GATHER_INTEL") {
          nextCurrent.ansLoad = Math.min(100, (state.currentEphemeris.ansLoad ?? 50) + 5);
          nextCurrent.shieldCapacity = Math.max(0, (state.currentEphemeris.shieldCapacity ?? 50) - 5);
        }
        nextState.currentEphemeris = nextCurrent;
      } else {
        if (action === "PREPARE_AND_WAIT") {
          nextState.ansLoad = Math.max(0, (state.ansLoad ?? 50) - 10);
          nextState.shieldCapacity = Math.min(100, (state.shieldCapacity ?? 50) + 5);
        } else if (action === "ABORT_AND_SHIELD") {
          nextState.ansLoad = Math.max(0, (state.ansLoad ?? 50) - 15);
          nextState.shieldCapacity = Math.min(100, (state.shieldCapacity ?? 50) + 10);
        } else if (action === "EXECUTE_RELOCATION") {
          nextState.ansLoad = Math.min(100, (state.ansLoad ?? 50) + 20);
          nextState.shieldCapacity = Math.max(0, (state.shieldCapacity ?? 50) - 15);
        } else if (action === "EXECUTE_PURGE_RELOCATION") {
          nextState.ansLoad = Math.min(100, (state.ansLoad ?? 50) + 30);
          nextState.shieldCapacity = Math.max(0, (state.shieldCapacity ?? 50) - 40);
        } else if (action === "GATHER_INTEL") {
          nextState.ansLoad = Math.min(100, (state.ansLoad ?? 50) + 5);
          nextState.shieldCapacity = Math.max(0, (state.shieldCapacity ?? 50) - 5);
        }
      }

      const nextEncodedLayers = this.encodeStateLayers(nextState);

      // Compute Max_A' Q(S', A') using next encoded layers
      let maxNextQ = -Infinity;
      for (const nextAct of actions) {
        if (macroInstruction === "BLOCK_ACTIVE_RELOCATION" && 
            (nextAct === "EXECUTE_RELOCATION" || nextAct === "EXECUTE_PURGE_RELOCATION")) {
          continue;
        }
        const nextQ = this.evaluateStateStatic(
          nextState,
          nextAct,
          attentionRiskAdjustment,
          nextEncodedLayers,
          macroInstruction,
        );
        if (nextQ > maxNextQ) {
          maxNextQ = nextQ;
        }
      }

      // Bellman Equation: Q(S, A) = R(S, A) + gamma * max_A' Q(S', A')
      const gamma = (action === "EXECUTE_RELOCATION" || action === "EXECUTE_PURGE_RELOCATION") ? 0.90 : 0.50;
      const q = currentQStatic + gamma * maxNextQ;

      qValues[action] = q;
      logicTrace.push(
        `[BELLMAN] Q(${action}) = R(S,A): ${currentQStatic.toFixed(3)} + γ*maxQ(S',A'): (${gamma} * ${maxNextQ.toFixed(3)}) = ${q.toFixed(3)}`,
      );

      if (q > maxQ) {
        maxQ = q;
        bestAction = action;
      }
    }

    logicTrace.push(
      `[SELECTION] Selected Action: ${bestAction} (Max Q-Value: ${maxQ.toFixed(3)})`,
    );

    // Calculate Confidence using Softmax probability distribution with adjusted temperature
    const expQ = actions.map((a) => Math.exp(qValues[a] / temperature));
    const sumExpQ = expQ.reduce((a, b) => a + b, 0);
    const probabilities = expQ.map((eq) => eq / sumExpQ);

    const bestActionIndex = actions.indexOf(bestAction);
    let confidence = probabilities[bestActionIndex];

    // Apply I-Ching confidence boost
    if (target.ichingHexagram) {
      confidence += target.ichingHexagram.confidenceBoost;
      confidence = Math.max(0, Math.min(1, confidence));
      logicTrace.push(
        `[CONFIDENCE] Post-modifier Confidence Adjusted to ${(confidence * 100).toFixed(1)}%`,
      );
    }

    // Scale Q-value to expected reward (-100 to 100)
    const expectedReward = Math.max(-100, Math.min(100, maxQ * 50));

    const probabilitiesObj: Record<ActionType, number> = {} as any;
    actions.forEach((a, idx) => {
      probabilitiesObj[a] = probabilities[idx];
    });

    // --- LLM Token Generation Mimicry Trace ---
    const llmPredictionTrace: string[] = [];
    const dayMasterName = target.ragContext?.personalBazi?.summary?.dayMaster || "甲";
    llmPredictionTrace.push(
      `[Token 1: <s_start>] Initializing Metaphysical Decision Transformer...`,
    );
    llmPredictionTrace.push(
      `[Token 2: Attention] Day Master "${dayMasterName}" attends to environment. Max attention weight on key "Macro Risk": ${(dmToRiskAttention * 100).toFixed(1)}%.`,
    );
    llmPredictionTrace.push(
      `[Token 3: Gate] Sigmoid ANS load gate activated at ${(ansStressGate * 100).toFixed(1)}% intensity (Threshold: 65%).`,
    );
    llmPredictionTrace.push(
      `[Token 4: Gate] Sigmoid Shield vulnerability gate activated at ${(shieldVulnerabilityGate * 100).toFixed(1)}% intensity (Threshold: 70%).`,
    );
    llmPredictionTrace.push(
      `[Token 5: Logits] Mapping adjusted state vector to action logits: [${actions.map((a) => `${a.replace("EXECUTE_", "")}:${qValues[a].toFixed(2)}`).join(", ")}].`,
    );
    llmPredictionTrace.push(
      `[Token 6: Softmax] Softmax probability distribution (Temp=${temperature.toFixed(2)}): [${actions.map((a) => `${a.replace("EXECUTE_", "")}:${(probabilitiesObj[a] * 100).toFixed(1)}%`).join(", ")}].`,
    );
    llmPredictionTrace.push(
      `[Token 7: Prediction] Predicted action token: "${bestAction}" with confidence ${(confidence * 100).toFixed(1)}%.`,
    );
    llmPredictionTrace.push(
      `[Token 8: <s_end>] Optimal action sequence generated.`,
    );

    return {
      suggestedAction: bestAction,
      confidence,
      expectedReward: parseFloat(expectedReward.toFixed(2)),
      policyType: "Decision_Transformer_Softmax_Bellman_FQI",
      qValues,
      probabilities: probabilitiesObj,
      logicTrace,
      attentionMatrix,
      sigmoidGates: {
        ansStressGate,
        shieldVulnerabilityGate,
      },
      llmPredictionTrace,
      // Enhanced layered/hierarchical metrics
      stateVectorLayers: encodedLayers,
      macroAgentEvaluation: {
        macroQValues,
        macroInstruction,
        macroRiskFactor,
      },
      closedLoopRewardFeedback: {
        feedbackValue: closedLoopFeedback,
        adjustedTemperature: temperature,
        actionAdjustments,
      },
    };
  }
}
