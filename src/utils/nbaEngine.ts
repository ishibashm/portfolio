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
    ichingHexagram?: {
      number: number;
      name: string;
      riskModifier: number;
      confidenceBoost: number;
      actionAdvice: string;
    };
  };
}

// Pre-defined Actions in our Markov Decision Process
type ActionType = 'DEEP_REST' | 'SHIELD_UP' | 'NORMAL_OPS' | 'HIGH_INTENSITY_EXECUTION';

interface QWeights {
  w_ans: number;
  w_shield: number;
  w_risk: number;
  w_solar: number;
  bias: number;
}

// Weights mimicking a trained policy matrix (W^T * X + B)
const PolicyWeights: Record<ActionType, QWeights> = {
  DEEP_REST: {
    w_ans: 0.6,      // High ANS Load strongly rewards rest
    w_shield: -0.5,  // Low Shield Capacity strongly rewards rest
    w_risk: 0.2,     // High risk slightly rewards rest
    w_solar: 0.0,
    bias: 0.4,
  },
  SHIELD_UP: {
    w_ans: 0.2,
    w_shield: 0.1,
    w_risk: 0.7,     // High environmental risk strongly rewards shielding
    w_solar: -0.2,   // Poor alignment rewards shielding
    bias: 0.2,
  },
  NORMAL_OPS: {
    w_ans: -0.2,
    w_shield: 0.3,
    w_risk: -0.2,
    w_solar: 0.2,
    bias: 0.5,
  },
  HIGH_INTENSITY_EXECUTION: {
    w_ans: -0.6,     // Low ANS Load allows high intensity
    w_shield: 0.8,   // High Shield Capacity allows high intensity
    w_risk: -0.4,    // Low risk allows high intensity
    w_solar: 0.5,    // Auspicious alignment strongly boosts high intensity
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
    const { ansLoad, shieldCapacity, environmentalRisk = 50, solarPhase, ichingHexagram } = params.stateVector;
    
    // Apply I-Ching metaphysical modifiers if available
    let finalRisk = environmentalRisk;
    if (ichingHexagram) {
      finalRisk += ichingHexagram.riskModifier;
    }
    // Clamp to 0-100 range
    finalRisk = Math.max(0, Math.min(100, finalRisk));

    // Normalize State Features (0.0 to 1.0 range, except solarPhase -1.0 to 1.0)
    const f1_ans = ansLoad / 100.0;
    const f2_shield = shieldCapacity / 100.0;
    const f3_risk = finalRisk / 100.0;
    // Map 0-360 degrees to a -1.0 to 1.0 alignment score (Cosine wave)
    const f4_solar = Math.cos((solarPhase * Math.PI) / 180.0);

    const logicTrace: string[] = [];
    logicTrace.push(`[INIT] Input Features: ANS=${f1_ans.toFixed(2)}, SHIELD=${f2_shield.toFixed(2)}, RISK=${f3_risk.toFixed(2)}, SOLAR_ALIGNMENT=${f4_solar.toFixed(2)}`);
    if (ichingHexagram) {
      logicTrace.push(`[MODIFIER] I-Ching Hexagram ${ichingHexagram.number} applied: Risk Modifier ${ichingHexagram.riskModifier > 0 ? '+' : ''}${ichingHexagram.riskModifier}, Confidence Boost ${ichingHexagram.confidenceBoost > 0 ? '+' : ''}${ichingHexagram.confidenceBoost}`);
    }

    // 2. Calculate Q-values for each action
    const qValues: Record<ActionType, number> = {} as any;
    const actions = Object.keys(PolicyWeights) as ActionType[];

    let maxQ = -Infinity;
    let bestAction: ActionType = 'NORMAL_OPS';

    for (const action of actions) {
      const W = PolicyWeights[action];
      const q = 
        (W.w_ans * f1_ans) + 
        (W.w_shield * f2_shield) + 
        (W.w_risk * f3_risk) + 
        (W.w_solar * f4_solar) + 
        W.bias;

      qValues[action] = q;
      logicTrace.push(`[CALC] Q(${action}) = (${W.w_ans}*${f1_ans.toFixed(2)}) + (${W.w_shield}*${f2_shield.toFixed(2)}) + (${W.w_risk}*${f3_risk.toFixed(2)}) + (${W.w_solar}*${f4_solar.toFixed(2)}) + ${W.bias} = ${q.toFixed(3)}`);

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
