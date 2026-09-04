import { Solar } from "lunar-javascript";
import { calculateSolarTime, getZonedDateTimeFields } from "./solarTime";

/**
 * BaZi (Four Pillars of Destiny) Engine
 * Integrated with lunar-javascript and solarTime utilities.
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

export interface LuckCycle {
  startYear: number;
  endYear: number;
  ganZhi: string;
}

export interface BaziResult {
  solarTime: Date;
  pillars: {
    year: BaziPillar;
    month: BaziPillar;
    day: BaziPillar;
    hour: BaziPillar;
  };
  fiveElements: Record<string, number>;
  shenSha: string[];
  solarTerms: Record<string, string>;
  luckCycles: LuckCycle[];
  summary: {
    dayMaster: string;
    dayMasterWuxing: string;
    description: string;
    strength: string;
  };
}

/** 四柱。lunar-javascript の取り出し名がこの綴り（時柱は Time）。 */
type PillarType = "Year" | "Month" | "Day" | "Time";

/**
 * lunar-javascript の `EightChar` のうち、**この engine が呼ぶものだけ。**
 *
 * ライブラリの型定義（`src/types/lunar-javascript.d.ts`）は `any` のまま
 * なので、受け取る側で読む枝を写す（CLAUDE.md 3 節・#149 と同じ方針）。
 * 柱ごとの取り出しは `get{柱}{項目}` という綴りで並んでいて、テンプレート
 * リテラル型で書けば `extractPillar` の動的な呼び出しがそのまま通る。
 */
type PillarGetters = {
  [K in `get${PillarType}${
    | "Gan"
    | "Zhi"
    | "ShiShenGan"
    | "DiShi"
    | "NaYin"
    | "WuXing"}`]: () => string;
} & {
  [K in `get${PillarType}${"HideGan" | "ShiShenZhi"}`]: () => string[];
};

/** 大運 1 期ぶん。 */
interface DaYunLike {
  getStartYear(): number;
  getEndYear(): number;
  getGanZhi(): string;
}

interface EightCharLike extends PillarGetters {
  /** 日柱の空亡（天中殺）の十二支。 */
  getDayXunKong(): string;
  getYun(gender: number): { getDaYun(): DaYunLike[] };
}

/** `Lunar` のうち、この engine が呼ぶものだけ。 */
interface LunarLike {
  getDayJiShen(): string[];
  getJieQiTable(): Record<string, { toFullString(): string }>;
}

export class BaziEngine {
  /**
   * Calculate full BaZi chart
   * @param date Standard date
   * @param longitude Longitude for True Solar Time
   * @param gender 1 for male, 0 for female (default 1)
   */
  public calculate(
    date: Date,
    longitude: number,
    gender: number = 1,
  ): BaziResult {
    // 1. Adjust for True Solar Time
    const solarResult = calculateSolarTime(date, longitude);
    const solarTime = solarResult.solarTime;

    // 2. Initialize Lunar/EightChar
    /* ORIGINAL LOGIC (Preserved for reference):
    const solar = Solar.fromDate(solarTime);
    */
    const fields = getZonedDateTimeFields(solarTime, 9);
    const solar = Solar.fromYmdHms(
      fields.year,
      fields.month,
      fields.day,
      fields.hours,
      fields.minutes,
      fields.seconds,
    );
    const lunar = solar.getLunar();
    const eightChar = lunar.getEightChar();

    // 3. Extract Pillars
    const pillars = {
      year: this.extractPillar(eightChar, "Year"),
      month: this.extractPillar(eightChar, "Month"),
      day: this.extractPillar(eightChar, "Day"),
      hour: this.extractPillar(eightChar, "Time"),
    };

    // 4. Calculate Five Elements Balance
    const fiveElements = this.calculateFiveElements(pillars);

    // 5. Calculate Shen Sha (Simplified)
    const shenSha = this.calculateShenSha(eightChar, lunar);

    // 6. Get Solar Terms
    const solarTerms = this.getSolarTerms(lunar);

    // 7. Calculate Luck Cycles (Da Yun)
    const luckCycles = this.calculateLuckCycles(eightChar, gender);

    // 8. Generate Summary
    const dayMaster = eightChar.getDayGan();
    const dayMasterWuxing = eightChar.getDayWuXing().substring(0, 1);
    const summary = this.generateSummary(
      dayMaster,
      dayMasterWuxing,
      fiveElements,
    );

    return {
      solarTime,
      pillars,
      fiveElements,
      shenSha,
      solarTerms,
      luckCycles,
      summary,
    };
  }

  private extractPillar(
    eightChar: EightCharLike,
    type: PillarType,
  ): BaziPillar {
    const gan = eightChar[`get${type}Gan`]();
    const zhi = eightChar[`get${type}Zhi`]();
    const ganTenGod = eightChar[`get${type}ShiShenGan`]() || "日主";
    const hiddenStems = eightChar[`get${type}HideGan`]();
    const hiddenStemTenGods = eightChar[`get${type}ShiShenZhi`]();
    const lifeStage = eightChar[`get${type}DiShi`]();
    const nayin = eightChar[`get${type}NaYin`]();
    const wuxing = eightChar[`get${type}WuXing`]();

    return {
      gan,
      zhi,
      ganTenGod,
      hiddenStems,
      hiddenStemTenGods,
      lifeStage,
      nayin,
      wuxing,
    };
  }

  private getStemWuxing(stem: string): string {
    const map: Record<string, string> = {
      甲: "木",
      乙: "木",
      丙: "火",
      丁: "火",
      戊: "土",
      己: "土",
      庚: "金",
      辛: "金",
      壬: "水",
      癸: "水",
    };
    return map[stem] || "";
  }

  private calculateFiveElements(
    pillars: BaziResult["pillars"],
  ): Record<string, number> {
    const balance: Record<string, number> = {
      木: 0,
      火: 0,
      土: 0,
      金: 0,
      水: 0,
    };

    const addWeight = (element: string, weight: number) => {
      if (balance[element] !== undefined) {
        balance[element] += weight;
      }
    };

    const processPillar = (pillar: BaziPillar) => {
      // 1. Celestial Stem (gan) gets weight 1.0
      if (pillar.gan) {
        const stemWuxing = this.getStemWuxing(pillar.gan);
        if (stemWuxing) {
          addWeight(stemWuxing, 1.0);
        }
      }

      // 2. Earthly Branch (zhi) total weight = 1.0, distributed among hidden stems
      const hidden = pillar.hiddenStems || [];
      if (hidden.length === 1) {
        const h0 = this.getStemWuxing(hidden[0]);
        if (h0) addWeight(h0, 1.0);
      } else if (hidden.length === 2) {
        const h0 = this.getStemWuxing(hidden[0]);
        const h1 = this.getStemWuxing(hidden[1]);
        if (h0) addWeight(h0, 0.7);
        if (h1) addWeight(h1, 0.3);
      } else if (hidden.length >= 3) {
        const h0 = this.getStemWuxing(hidden[0]);
        const h1 = this.getStemWuxing(hidden[1]);
        const h2 = this.getStemWuxing(hidden[2]);
        if (h0) addWeight(h0, 0.6);
        if (h1) addWeight(h1, 0.3);
        if (h2) addWeight(h2, 0.1);
      }
    };

    processPillar(pillars.year);
    processPillar(pillars.month);
    processPillar(pillars.day);
    processPillar(pillars.hour);

    // Round values to 2 decimal places to avoid floating point precision issues
    for (const key in balance) {
      balance[key] = Math.round(balance[key] * 100) / 100;
    }

    return balance;
  }

  private calculateShenSha(
    eightChar: EightCharLike,
    lunar: LunarLike,
  ): string[] {
    const stars: string[] = [];

    // Add logic for specific Shen Sha if needed
    // For now, extract from Lunar object's general auspicious stars
    const jiShen = lunar.getDayJiShen();
    if (jiShen && Array.isArray(jiShen)) {
      stars.push(...jiShen);
    }

    // Special BaZi Shen Sha
    const dayGan = eightChar.getDayGan();
    const yearZhi = eightChar.getYearZhi();

    // Example: Tian Yi Gui Ren (Simplified logic)
    // (Actual logic is more complex, but this shows how to add them)
    if (["甲", "戊"].includes(dayGan) && ["丑", "未"].includes(yearZhi))
      stars.push("天乙貴人");

    // Kong Wang (Void)
    const voidZhi = eightChar.getDayXunKong();
    stars.push(`空亡(${voidZhi})`);

    return Array.from(new Set(stars));
  }

  /**
   * 節気の一覧。**返る時刻は中国標準時（UTC+8）。**
   *
   * lunar-javascript は中国のライブラリで、節気表もそちらの時刻帯で返る。
   * 実測（2026-09-04）では、太陽黄経 315 度を解いた立春の瞬間を日本時間で
   * 出したものより、ちょうど 1 時間早い（2026 年なら 4:02 と 5:01）。
   *
   * **この値をそのまま日本時間として画面に出さないこと。**いまは
   * `BaziResult.solarTerms` に入るだけで、画面にも API 応答にも出ていない。
   * 出すときは +1 時間するか、`solarTermMonthAnchor` と同じく黄経から
   * 解き直す。判定はもともと後者を使っていて、時刻帯に依存しない。
   *
   * 関係は `__tests__/solarTermTimezone.test.ts` が固定している。
   */
  private getSolarTerms(lunar: LunarLike): Record<string, string> {
    const table = lunar.getJieQiTable();
    const terms: Record<string, string> = {};
    for (const key in table) {
      terms[key] = table[key].toFullString();
    }
    return terms;
  }

  private calculateLuckCycles(
    eightChar: EightCharLike,
    gender: number,
  ): LuckCycle[] {
    const yun = eightChar.getYun(gender);
    const daYun = yun.getDaYun();
    return daYun.slice(1, 9).map((dy) => ({
      startYear: dy.getStartYear(),
      endYear: dy.getEndYear(),
      ganZhi: dy.getGanZhi(),
    }));
  }

  private generateSummary(
    dayMaster: string,
    wuxing: string,
    balance: Record<string, number>,
  ): BaziResult["summary"] {
    let strength = "中庸";
    if (balance[wuxing] > 3) strength = "極強";
    else if (balance[wuxing] > 2) strength = "身強";
    else if (balance[wuxing] < 1) strength = "極弱";
    else if (balance[wuxing] < 2) strength = "身弱";

    const descriptions: Record<string, string> = {
      木: "向上心があり、慈悲深く、成長を象徴します。",
      火: "情熱的で、明朗、礼儀を重んじます。",
      土: "誠実で、包容力があり、信用を重んじます。",
      金: "義理堅く、決断力があり、鋭い知性を持ちます。",
      水: "知恵があり、柔軟で、流動性を持ちます。",
    };

    return {
      dayMaster,
      dayMasterWuxing: wuxing,
      description: descriptions[wuxing] || "分析中...",
      strength,
    };
  }
}

export const baziEngine = new BaziEngine();
