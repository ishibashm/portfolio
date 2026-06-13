import { ICHING_HEXAGRAMS_ROXY } from "@/utils/metaphysicalApis";

export interface Hexagram {
  number: number;
  name: string;
  pinyin: string;
  character: string;
  riskModifier: number; // Modifies the environmental risk
  confidenceBoost: number; // Modifies the NBA confidence
  actionAdvice: string;
}

const HEXAGRAM_DATA: Record<number, Hexagram> = {
  1: {
    number: 1,
    name: "乾 (Qian) - The Creative",
    pinyin: "Qian",
    character: "乾",
    riskModifier: -10,
    confidenceBoost: 0.15,
    actionAdvice: "高強度の活動に最適。創造的なエネルギーが満ちています。",
  },
  2: {
    number: 2,
    name: "坤 (Kun) - The Receptive",
    pinyin: "Kun",
    character: "坤",
    riskModifier: -5,
    confidenceBoost: 0.1,
    actionAdvice: "受容的になり、周囲との調和を優先してください。",
  },
  3: {
    number: 3,
    name: "屯 (Zhun) - Difficulty at the Beginning",
    pinyin: "Zhun",
    character: "屯",
    riskModifier: +15,
    confidenceBoost: -0.1,
    actionAdvice: "慎重な一歩を。無理な開始は避けてください。",
  },
  4: {
    number: 4,
    name: "蒙 (Meng) - Youthful Folly",
    pinyin: "Meng",
    character: "蒙",
    riskModifier: +5,
    confidenceBoost: -0.05,
    actionAdvice: "学びと観察の時。性急な判断は禁物です。",
  },
  5: {
    number: 5,
    name: "需 (Xu) - Waiting (Nourishment)",
    pinyin: "Xu",
    character: "需",
    riskModifier: 0,
    confidenceBoost: 0.05,
    actionAdvice: "待機と準備。好機が来るまで力を蓄えてください。",
  },
  6: {
    number: 6,
    name: "訟 (Song) - Conflict",
    pinyin: "Song",
    character: "訟",
    riskModifier: +20,
    confidenceBoost: -0.15,
    actionAdvice: "対立の兆し。妥協点を探り、深入りを避けてください。",
  },
  7: {
    number: 7,
    name: "師 (Shi) - The Army",
    pinyin: "Shi",
    character: "師",
    riskModifier: +10,
    confidenceBoost: 0.1,
    actionAdvice: "規律とリーダーシップ。組織的な行動が鍵となります。",
  },
  8: {
    number: 8,
    name: "比 (Bi) - Holding Together (Union)",
    pinyin: "Bi",
    character: "比",
    riskModifier: -10,
    confidenceBoost: 0.1,
    actionAdvice: "協力と提携。信頼できるパートナーとの連携を。",
  },
  29: {
    number: 29,
    name: "坎 (Kan) - The Abysmal (Water)",
    pinyin: "Kan",
    character: "坎",
    riskModifier: +25,
    confidenceBoost: -0.2,
    actionAdvice: "警戒が必要。感情の波に流されず、足元を固めてください。",
  },
  30: {
    number: 30,
    name: "離 (Li) - The Clinging (Fire)",
    pinyin: "Li",
    character: "離",
    riskModifier: -5,
    confidenceBoost: 0.1,
    actionAdvice: "明晰な洞察。情熱を持って取り組むべき時です。",
  },
  51: {
    number: 51,
    name: "震 (Zhen) - The Arousing (Thunder)",
    pinyin: "Zhen",
    character: "震",
    riskModifier: +15,
    confidenceBoost: 0.05,
    actionAdvice: "急激な変化。驚きをチャンスに変える準備を。",
  },
  52: {
    number: 52,
    name: "艮 (Gen) - Keeping Still (Mountain)",
    pinyin: "Gen",
    character: "艮",
    riskModifier: -15,
    confidenceBoost: -0.1,
    actionAdvice: "静止と内省。今は動かず、自己を見つめ直す時です。",
  },
  57: {
    number: 57,
    name: "巽 (Xun) - The Gentle (Wind)",
    pinyin: "Xun",
    character: "巽",
    riskModifier: 0,
    confidenceBoost: 0.05,
    actionAdvice: "柔軟な対応。風のように軽やかに状況に馴染んでください。",
  },
  58: {
    number: 58,
    name: "兌 (Dui) - The Joyous (Lake)",
    pinyin: "Dui",
    character: "兌",
    riskModifier: -10,
    confidenceBoost: 0.15,
    actionAdvice:
      "喜びと共有。コミュニケーションを楽しみ、調和を広げてください。",
  },
};

const DEFAULT_HEXAGRAM: Hexagram = {
  number: 63,
  name: "既濟 (Ji Ji) - After Completion",
  pinyin: "Ji Ji",
  character: "既濟",
  riskModifier: 0,
  confidenceBoost: 0,
  actionAdvice: "完成後の安定。現状維持と細部への注意を払ってください。",
};

export class IChingClient {
  /**
   * Generates a hexagram based on micro (internal) and macro (external) state vectors.
   * This bridges the ancient divination system with real-time biometric and environmental telemetry.
   */
  public calculateHexagram(
    ansLoad: number,
    shieldCapacity: number,
    envRisk: number,
    solarPhase: number,
  ): Hexagram {
    // Determine Lower Trigram (Internal State / Oura data)
    // Map 0-100 to 0-7 (8 trigrams)
    const internalSum = ansLoad + (100 - shieldCapacity);
    const lowerTrigramIndex = Math.floor(internalSum / 25) % 8; // 0 to 7

    // Determine Upper Trigram (External State / Tavily & Ephemeris data)
    const externalSum = envRisk + solarPhase;
    const upperTrigramIndex = Math.floor(externalSum / 45) % 8; // 0 to 7

    // Calculate Hexagram Number using a classical lookup or mathematical hash (1-64)
    // For our robust simulation, we use a bitwise combination to map to 1-64
    let hexagramNumber = upperTrigramIndex * 8 + lowerTrigramIndex + 1;

    // Fallback logic for missing hexagrams in our DB subset
    if (!HEXAGRAM_DATA[hexagramNumber]) {
      // Map to the nearest pure hexagram or known entry based on modulus
      const knownKeys = Object.keys(HEXAGRAM_DATA).map(Number);
      hexagramNumber = knownKeys[hexagramNumber % knownKeys.length];
    }

    return HEXAGRAM_DATA[hexagramNumber] || DEFAULT_HEXAGRAM;
  }

  public getHexagramByNumber(num: number, adviceFallback?: string): Hexagram {
    if (HEXAGRAM_DATA[num]) {
      return HEXAGRAM_DATA[num];
    }
    const name = ICHING_HEXAGRAMS_ROXY[num] || `Hexagram ${num}`;
    const charMatch = name.match(/^([^\s(]+)/);
    const character = charMatch ? charMatch[1] : "卦";
    const pinyinMatch = name.match(/\(([^)]+)\)/);
    const pinyin = pinyinMatch ? pinyinMatch[1] : `Hexagram ${num}`;

    return {
      number: num,
      name,
      pinyin,
      character,
      riskModifier: 0,
      confidenceBoost: 0,
      actionAdvice:
        adviceFallback || "安定した状態です。慎重に状況を見極めましょう。",
    };
  }
}
