import { Lunar, Solar } from "lunar-javascript";
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

  private extractPillar(eightChar: any, type: string): BaziPillar {
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

  private calculateFiveElements(pillars: any): Record<string, number> {
    const balance: Record<string, number> = {
      木: 0,
      火: 0,
      土: 0,
      金: 0,
      水: 0,
    };

    const count = (str: string) => {
      for (const char of str) {
        if (balance[char] !== undefined) {
          balance[char]++;
        }
      }
    };

    count(pillars.year.wuxing);
    count(pillars.month.wuxing);
    count(pillars.day.wuxing);
    count(pillars.hour.wuxing);

    return balance;
  }

  private calculateShenSha(eightChar: any, lunar: any): string[] {
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

  private getSolarTerms(lunar: any): Record<string, string> {
    const table = lunar.getJieQiTable();
    const terms: Record<string, string> = {};
    for (const key in table) {
      terms[key] = table[key].toFullString();
    }
    return terms;
  }

  private calculateLuckCycles(eightChar: any, gender: number): LuckCycle[] {
    const yun = eightChar.getYun(gender);
    const daYun = yun.getDaYun();
    return daYun.slice(1, 9).map((dy: any) => ({
      startYear: dy.getStartYear(),
      endYear: dy.getEndYear(),
      ganZhi: dy.getGanZhi(),
    }));
  }

  private generateSummary(
    dayMaster: string,
    wuxing: string,
    balance: Record<string, number>,
  ): any {
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
