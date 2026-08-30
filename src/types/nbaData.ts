/**
 * /api/nba の応答の型。
 *
 * もとは NBADashboard.tsx（2,800 行超）が持っていた。あの部品は #513 の
 * 調査どおりどこにも描画されておらず、丸ごと削除したが、応答の型だけは
 * 生きている画面（ScorecardPanel・SolarTimeClock）が import type で
 * 使い続けている。型をここへ移し、部品は消した。
 *
 * 定義は移動のみで 1 文字も変えていない。BaziData / BaziPillar は
 * BaziReport.tsx から、VedicData は VedicReport.tsx から一緒に移した
 * （どちらも削除した部品にしか描画されていなかったが、型は NBAData の
 * 一部として生きているため）。
 */

export interface BaziPillar {
  gan: string;
  zhi: string;
  ganTenGod: string;
  hiddenStems: string[];
  hiddenStemTenGods: string[];
  lifeStage: string;
  nayin: string;
  wuxing: string;
}

export interface BaziData {
  pillars: {
    year: BaziPillar;
    month: BaziPillar;
    day: BaziPillar;
    hour: BaziPillar;
  };
  fiveElements: Record<string, number>;
  summary: {
    dayMaster: string;
    dayMasterWuxing: string;
    description: string;
    strength: string;
  };
  shenSha: string[];
  solarTerms: Record<string, string>;
  luckCycles: Array<{ startYear: number; endYear: number; ganZhi: string }>;
}

export interface VedicData {
  nakshatra: string;
  moonProgress?: number;
  sunNakshatra?: string;
  sunProgress?: number;
  tithi: string;
  ayanamsa?: string;
}

export interface TarotCard {
  name: string;
  suit: string;
  arcana: "Major" | "Minor";
  orientation: "Upright" | "Reversed";
  meaning: string;
  riskModifier: number;
}

export interface NumerologyData {
  lifePathNumber: number;
  description: string;
}

export interface MetaphysicalData {
  divineApi: {
    tarot: TarotCard;
    numerology: NumerologyData;
    sourceInfo: string;
  };
  astrologyApi: {
    horoscope: string;
    aspects: {
      aspect: string;
      angle: number;
      quality: "harmonious" | "discordant" | "neutral";
    }[];
    sourceInfo: string;
  };
  vedAstro: {
    activeDasha: string;
    ashtakavargaPoints: Record<string, number>;
    planetaryStrengths: Record<string, number>;
    sourceInfo: string;
  };
  chineseMetasoft: {
    qiMenGate: {
      name: string;
      direction: string;
      description: string;
      status: "Auspicious" | "Inauspicious" | "Neutral";
    };
    daYunPillar: {
      pillar: string;
      startAge: number;
      endAge: number;
      description: string;
    } | null;
    sourceInfo: string;
  };
  roxyApi: {
    ichingCast: {
      hexagramNumber: number;
      name: string;
      lines: number[];
      changingLines: number[];
      relatingHexagram: {
        number: number;
        name: string;
      } | null;
      interpretation: string;
    };
    sourceInfo: string;
  };
  ziWeiDouShu?: {
    selfPalaceStar: string;
    bodyPalaceStar: string;
    activeFlyingStar: string;
    palacePosition: string;
    dailyInsight: string;
    sourceInfo: string;
  };
  nineStarKi?: {
    yearStar: string;
    monthStar: string;
    dayStar: string;
    magicSquareLocation: string;
    dailyDirectionSafety: string;
    sourceInfo: string;
  };
  mayaTzolkin?: {
    kinNumber: number;
    solarSeal: { name: string; glyph: string; meaning: string };
    galacticTone: { tone: number; name: string; power: string };
    dailyGuidance: string;
    sourceInfo: string;
  };
  kabbalahTree?: {
    activeSephirah: string;
    pathOfResonance: string;
    hebrewLetter: string;
    dailyVibrationScore: number;
    insight: string;
    sourceInfo: string;
  };
  humanDesign?: {
    chartType: string;
    authority: string;
    profile: string;
    activeChannels: string[];
    dailyGateActivation: string;
    sourceInfo: string;
  };
  geomancy?: {
    figureName: string;
    binaryPoints: number[];
    element: string;
    astrologicalAssociation: string;
    interpretation: string;
    sourceInfo: string;
  };
}

/**
 * 天体位置。/api/nba は同じものを macro.streams.ephemeris と
 * nba.stateVector.ephemerisData.planetaryPositions の両方に入れて返す
 * （前者は画面用、後者は判定エンジンへ渡した入力の控え）。
 * 同じ形を 2 か所に書かないため名前を付ける。
 */
export interface EphemerisPositions {
  sun: string;
  moon: string;
  mercury: string;
  venus: string;
  mars: string;
  jupiter: string;
  saturn: string;
  lunarNode: string;
}

export interface NBAData {
  micro: {
    hrv: number;
    gsr: number;
    ansLoad?: number;
    shieldCapacity?: number;
  };
  macro: {
    environmentalNoise: string;
    streams?: {
      ephemeris: EphemerisPositions;
      environmentalBazi?: BaziData & { context: string };
      personalBazi?:
        | (BaziData & { context: string; voidZodiac: string })
        | null;
      westernAstrology: {
        aspects: string[];
        retrogrades: string[];
      };
      vedicAstrology: VedicData;
      spaceWeather?: {
        kpIndex: number | null;
        xrayFlux: string | null;
        solarWindSpeed: number | null;
        timestamp: string | null;
        riskScore: number;
      };
      macroEconomics?: {
        vix: number;
        creditSpread: number;
        isMocked: boolean;
        riskScore: number;
      };
      lunarTide?: {
        distanceKm: number;
        tideIntensity: number;
        distanceCloseness: number;
        gravitationalTideScore: number;
        riskScore: number;
      };
      metaphysical?: MetaphysicalData;
      isVoidTime?: boolean;
      isConflictDay?: boolean;
      unifiedRiskScore?: number;
    };
  };
  nba: {
    stateVector: {
      ansLoad: number;
      shieldCapacity: number;
      environmentalRisk?: number;
      unifiedRiskScore?: number;
      isVoidTime?: boolean;
      isConflictDay?: boolean;
      solarPhase: number;
      stressLevel?: number;
      resilience?: string;
      /**
       * 判定エンジンへ渡した入力の控え。中身は macro.streams と同じ実体で、
       * route が同じ値を入れている（ephemeris / westernAstrology.aspects /
       * environmentalBazi / personalBazi / vedicAstrology）。
       */
      ephemerisData?: {
        source: string;
        planetaryPositions: EphemerisPositions;
      };
      astrologyData?: {
        source: string;
        transits: string[];
      };
      ragContext?: {
        source: string;
        classicalRules: BaziData & { context: string };
        personalBazi?:
          | (BaziData & { context: string; voidZodiac: string })
          | null;
      };
      vedicAstrology?: VedicData;
      ichingHexagram?: {
        number: number;
        name: string;
        riskModifier: number;
        confidenceBoost: number;
        actionAdvice: string;
      };
      environmentalNoise: string;
    };
    actionResult: {
      suggestedAction: string;
      confidence: number;
      expectedReward: number;
      policyType: string;
      qValues?: Record<string, number>;
      probabilities?: Record<string, number>;
      logicTrace?: string[];
      attentionMatrix?: number[][];
      sigmoidGates?: {
        ansStressGate: number;
        shieldVulnerabilityGate: number;
      };
      llmPredictionTrace?: string[];
    };
  };
}
