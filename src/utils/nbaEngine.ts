/**
 * Next Best Action (NBA) Engine
 * Uses Offline Reinforcement Learning (FQI) principles to suggest the optimal action based on current state.
 */

export interface NBAParams {
  stateVector: {
    ansLoad: number; // 0-100
    shieldCapacity: number; // 0-100
    environmentalNoise: string;
    environmentalRisk?: number; // 0-100 (Inferred macro risk)
    solarPhase: number; // 0-360 degrees
    stressLevel?: number; // 0-100
    resilience?: string; // e.g. 'adequate'
    // --- Enriched Data Streams from データストリーム.md ---
    ephemerisData?: {
      source: string;
      planetaryPositions: any;
    };
    astrologyData?: {
      source: string;
      transits: any;
    };
    ragContext?: {
      source: string;
      classicalRules: any;
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
  };
}

// Pre-defined Actions in our Markov Decision Process (Relocation Context)
type ActionType = 'EXECUTE_RELOCATION' | 'PREPARE_AND_WAIT' | 'GATHER_INTEL' | 'ABORT_AND_SHIELD';

interface QWeights {
  w_ans: number;
  w_shield: number;
  w_risk: number;
  w_solar: number;
  w_vedic: number;
  w_ephem: number;
  w_astro: number;
  w_rag: number;
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
    bias: -0.2,
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
    bias: 0.0,
  }
};

export class NBAEngine {
  /**
   * Evaluates the current state vector using a deterministic Q-value heuristic.
   * This serves as the parameter-driven logic for optimal action selection,
   * preparing the architecture for integration with a d3rlpy Python microservice.
   */
  async getNextBestAction(params: NBAParams) {
    const { ansLoad, shieldCapacity, environmentalRisk = 50, solarPhase, ichingHexagram, vedicAstrology, ephemerisData, astrologyData, ragContext } = params.stateVector;
    
    // Apply I-Ching metaphysical modifiers if available
    let finalRisk = environmentalRisk;
    if (ichingHexagram) {
      finalRisk += ichingHexagram.riskModifier;
    }
    // Clamp to 0-100 range
    finalRisk = Math.max(0, Math.min(100, finalRisk));

    // Normalize State Features (0.0 to 1.0 range, except solarPhase and vedic phase -1.0 to 1.0)
    const f1_ans = ansLoad / 100.0;
    const f2_shield = shieldCapacity / 100.0;
    const f3_risk = finalRisk / 100.0;
    // Map 0-360 degrees to a -1.0 to 1.0 alignment score (Cosine wave)
    const f4_solar = Math.cos((solarPhase * Math.PI) / 180.0);

    // Vedic Phase Feature: map Tithi to -1.0 (New Moon) to 1.0 (Full Moon)
    let f5_vedic = 0;
    if (vedicAstrology && vedicAstrology.tithi) {
      const match = vedicAstrology.tithi.match(/\d+/);
      if (match) {
        const tithiNum = parseInt(match[0], 10);
        const tithiPhase = (tithiNum - 1) / 30; // 0.0 to approx 1.0
        f5_vedic = -Math.cos(tithiPhase * 2 * Math.PI);
        
        // Add subtle transit dynamics using Nakshatra moon progress
        if (vedicAstrology.moonProgress !== undefined) {
          f5_vedic += (vedicAstrology.moonProgress - 0.5) * 0.2;
          f5_vedic = Math.max(-1.0, Math.min(1.0, f5_vedic));
        }
      }
    }

    // Ephemeris Feature: Mars vs Saturn angular relationship as tension index
    let f6_ephem = 0;
    if (ephemerisData && ephemerisData.planetaryPositions) {
      const mars = parseFloat(ephemerisData.planetaryPositions.mars);
      const saturn = parseFloat(ephemerisData.planetaryPositions.saturn);
      if (!isNaN(mars) && !isNaN(saturn)) {
        // cosine of angle between Mars and Saturn
        f6_ephem = Math.cos((mars - saturn) * Math.PI / 180.0);
      }
    }

    // Astrology Transits Feature: Soft aspects (+1) vs Hard aspects (-1)
    let f7_astro = 0;
    if (astrologyData && astrologyData.transits && Array.isArray(astrologyData.transits)) {
      const aspects = astrologyData.transits.join(' ').toUpperCase();
      const hard = (aspects.match(/SQUARE|OPPOSITION/g) || []).length;
      const soft = (aspects.match(/TRINE|SEXTILE/g) || []).length;
      f7_astro = (soft - hard) * 0.25; // 0.25 weight per aspect
      f7_astro = Math.max(-1.0, Math.min(1.0, f7_astro));
    }

    // RAG/Classical Rules (Bazi) Feature: Strong vs Stable signs
    let f8_rag = 0;
    if (ragContext && ragContext.classicalRules) {
      const rules = JSON.stringify(ragContext.classicalRules).toLowerCase();
      // 'Dragon', 'Tiger', 'Horse' represent high energy execution
      const strong = (rules.match(/dragon|tiger|horse/g) || []).length;
      // 'Ox', 'Rabbit', 'Sheep' represent stable/conservative energy
      const stable = (rules.match(/ox|rabbit|sheep/g) || []).length;
      f8_rag = (strong - stable) * 0.3;
      f8_rag = Math.max(-1.0, Math.min(1.0, f8_rag));
    }

    const logicTrace: string[] = [];
    logicTrace.push(`[INIT] Features: ANS=${f1_ans.toFixed(2)}, SHIELD=${f2_shield.toFixed(2)}, RISK=${f3_risk.toFixed(2)}, SOLAR=${f4_solar.toFixed(2)}, VEDIC=${f5_vedic.toFixed(2)}, EPHEM=${f6_ephem.toFixed(2)}, ASTRO=${f7_astro.toFixed(2)}, RAG=${f8_rag.toFixed(2)}`);
    if (ichingHexagram) {
      logicTrace.push(`[MODIFIER] I-Ching Hexagram ${ichingHexagram.number} applied: Risk Modifier ${ichingHexagram.riskModifier > 0 ? '+' : ''}${ichingHexagram.riskModifier}, Confidence Boost ${ichingHexagram.confidenceBoost > 0 ? '+' : ''}${ichingHexagram.confidenceBoost}`);
    }

    // 2. Calculate Q-values for each action
    const qValues: Record<ActionType, number> = {} as any;
    const actions = Object.keys(PolicyWeights) as ActionType[];

    let maxQ = -Infinity;
    let bestAction: ActionType = 'PREPARE_AND_WAIT';

    for (const action of actions) {
      const W = PolicyWeights[action];
      const q = 
        (W.w_ans * f1_ans) + 
        (W.w_shield * f2_shield) + 
        (W.w_risk * f3_risk) + 
        (W.w_solar * f4_solar) + 
        (W.w_vedic * f5_vedic) + 
        (W.w_ephem * f6_ephem) + 
        (W.w_astro * f7_astro) + 
        (W.w_rag * f8_rag) + 
        W.bias;

      qValues[action] = q;
      logicTrace.push(`[CALC] Q(${action}) = (${W.w_ans}*${f1_ans.toFixed(2)}) + (${W.w_shield}*${f2_shield.toFixed(2)}) + (${W.w_risk}*${f3_risk.toFixed(2)}) + (${W.w_solar}*${f4_solar.toFixed(2)}) + (${W.w_vedic}*${f5_vedic.toFixed(2)}) + (${W.w_ephem}*${f6_ephem.toFixed(2)}) + (${W.w_astro}*${f7_astro.toFixed(2)}) + (${W.w_rag}*${f8_rag.toFixed(2)}) + ${W.bias} = ${q.toFixed(3)}`);

      if (q > maxQ) {
        maxQ = q;
        bestAction = action;
      }
    }
    
    logicTrace.push(`[SELECTION] Selected Action: ${bestAction} (Max Q-Value: ${maxQ.toFixed(3)})`);

    // 3. Calculate Confidence using Softmax probability distribution
    const temperature = 0.2; // Controls confidence sharpness
    const expQ = actions.map(a => Math.exp(qValues[a] / temperature));
    const sumExpQ = expQ.reduce((a, b) => a + b, 0);
    const probabilities = expQ.map(eq => eq / sumExpQ);
    
    const bestActionIndex = actions.indexOf(bestAction);
    let confidence = probabilities[bestActionIndex];

    // Apply I-Ching confidence boost
    if (ichingHexagram) {
      confidence += ichingHexagram.confidenceBoost;
      confidence = Math.max(0, Math.min(1, confidence));
      logicTrace.push(`[CONFIDENCE] Post-modifier Confidence Adjusted to ${(confidence * 100).toFixed(1)}%`);
    }

    // Scale Q-value to a more readable reward format (e.g., 0-100 scale)
    const expectedReward = Math.max(0, Math.min(100, maxQ * 50));

    const probabilitiesObj: Record<ActionType, number> = {} as any;
    actions.forEach((a, idx) => {
      probabilitiesObj[a] = probabilities[idx];
    });

    return {
      suggestedAction: bestAction,
      confidence,
      expectedReward: parseFloat(expectedReward.toFixed(2)),
      policyType: 'Deterministic_Q_Heuristic',
      qValues,
      probabilities: probabilitiesObj,
      logicTrace
    };
  }
}
