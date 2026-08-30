import { EvaluationContext, TimingScorer } from "../types";
import { directionLabelShort } from "@/lib/directionLabels";
import { isFatalNoise } from "@/utils/noiseSeverity";
import {
  getDayStar,
  getYearStar,
  getMonthStar,
  getCurrentZodiac,
  AstroEngine,
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  generateBoard,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  StarFrequency,
} from "../../ephemerisEngine";

export class KigakuScorer implements TimingScorer {
  name = "Kigaku (Oriental Astrology)";

  observe(ctx: EvaluationContext) {
    if (!ctx.userKigakuStar) {
      return {
        phenomenon: "Insufficient Data",
        detail: "本命星の登録がないため観測不能です。",
      };
    }

    if (
      !ctx.targetDirection ||
      ctx.latitude === undefined ||
      ctx.latitude === null ||
      isNaN(ctx.latitude) ||
      ctx.longitude === undefined ||
      ctx.longitude === null ||
      isNaN(ctx.longitude)
    ) {
      return null;
    }

    const yearStar = ctx.useClassical
      ? getClassicalYearStar(ctx.targetDate)
      : getYearStar(ctx.targetDate);
    const monthStar = ctx.useClassical
      ? getClassicalMonthStar(ctx.targetDate)
      : getMonthStar(ctx.targetDate);
    const dailyStar = ctx.useClassical
      ? getClassicalDayStar(ctx.targetDate)
      : getDayStar(ctx.targetDate);

    const yB = generateBoard(yearStar);
    const mB = generateBoard(monthStar);
    const dB = generateBoard(dailyStar);

    // If targetDirection is specified, look up the star in that direction for phase compatibility check
    const activeYearStar = ctx.targetDirection
      ? yB[ctx.targetDirection]
      : yearStar;
    const activeMonthStar = ctx.targetDirection
      ? mB[ctx.targetDirection]
      : monthStar;
    const activeDailyStar = ctx.targetDirection
      ? dB[ctx.targetDirection]
      : dailyStar;

    const elementMap: Record<number, string> = {
      1: "water",
      2: "earth",
      3: "wood",
      4: "wood",
      5: "earth",
      6: "metal",
      7: "metal",
      8: "earth",
      9: "fire",
    };

    const userElement = elementMap[ctx.userKigakuStar];

    const evaluatePhase = (star: number) => {
      const el = elementMap[star];
      if (ctx.userKigakuStar === star) return "比和";

      const sojoRules: Record<string, string> = {
        wood: "fire",
        fire: "earth",
        earth: "metal",
        metal: "water",
        water: "wood",
      };
      const sojoRulesReverse: Record<string, string> = {
        fire: "wood",
        earth: "fire",
        metal: "earth",
        water: "metal",
        wood: "water",
      };
      if (sojoRules[userElement] === el || sojoRulesReverse[userElement] === el)
        return "相生";

      const sokokuRules: Record<string, string> = {
        wood: "earth",
        earth: "water",
        water: "fire",
        fire: "metal",
        metal: "wood",
      };
      if (sokokuRules[userElement] === el || sokokuRules[el] === userElement)
        return "相剋";

      return "独立";
    };

    const yPhase = evaluatePhase(activeYearStar);
    const mPhase = evaluatePhase(activeMonthStar);
    const dPhase = evaluatePhase(activeDailyStar);

    const isGood = (p: string) => p === "比和" || p === "相生";
    let overallGood = isGood(yPhase) && isGood(mPhase) && isGood(dPhase);

    // Direction-based Collision Validation
    let targetClashStatus: string | null = null;
    let isDayWarning = false;
    if (ctx.targetDirection && ctx.userKigakuStar) {
      const voidZodiacs = ctx.userBirthDate
        ? getPersonalVoidZodiac(ctx.userBirthDate)
        : [];
      const lunarNodeLon = AstroEngine.getLunarNodeLongitude(ctx.targetDate);
      const collision = calculateVectorCollision(
        ctx.userKigakuStar as StarFrequency,
        yB,
        mB,
        dB,
        voidZodiacs,
        lunarNodeLon,
        ctx.actionIntent || "DEFAULT",
        ctx.targetDate,
        ctx.longitude || 139.6917,
        undefined,
        ctx.useClassical ? "traditional" : "physical",
      );
      const status = collision.finalVectors[ctx.targetDirection];
      // 五大凶殺の集合をここに直接書いていた。値は noiseSeverity と同じだが、
      // 写しなのであちらを変えてもここは追従しない。定義元から引く。
      if (isFatalNoise(status)) {
        targetClashStatus = status;
        overallGood = false; // Prevent Complete Resonance on clashing directions
      } else if (status === "WARNING") {
        isDayWarning = true;
      }
    }

    // Doyou (土用) & Mabi (間日) Check
    const L0 = AstroEngine.getSolarLongitude(ctx.targetDate);
    let doyouType: "SPRING" | "SUMMER" | "AUTUMN" | "WINTER" | null = null;
    if (L0 >= 27 && L0 < 45) doyouType = "SPRING";
    else if (L0 >= 117 && L0 < 135) doyouType = "SUMMER";
    else if (L0 >= 207 && L0 < 225) doyouType = "AUTUMN";
    else if (L0 >= 297 && L0 < 315) doyouType = "WINTER";

    const inDoyou = doyouType !== null;
    let isMabi = false;
    if (inDoyou) {
      const zodiacs = getCurrentZodiac(
        ctx.targetDate,
        ctx.longitude || 139.6917,
      );
      if (zodiacs?.dayZodiac) {
        if (doyouType === "SPRING")
          isMabi = ["巳", "午", "酉"].includes(zodiacs.dayZodiac);
        else if (doyouType === "SUMMER")
          isMabi = ["卯", "辰", "申"].includes(zodiacs.dayZodiac);
        else if (doyouType === "AUTUMN")
          isMabi = ["未", "酉", "亥"].includes(zodiacs.dayZodiac);
        else if (doyouType === "WINTER")
          isMabi = ["寅", "卯", "巳"].includes(zodiacs.dayZodiac);
      }
    }
    const isDoyouHazard = inDoyou && !isMabi;

    let mainPhenomenon = "";
    if (isDoyouHazard) {
      mainPhenomenon = `土用殺 (Doyou Hazard)`;
    } else if (targetClashStatus) {
      mainPhenomenon = `警告・方位に凶殺`;
    } else if (isDayWarning) {
      mainPhenomenon = `引越当日の注意（日盤のみ凶）`;
    } else if (overallGood) {
      mainPhenomenon = `三盤とも吉 (Year:${yPhase}/Month:${mPhase}/Day:${dPhase})`;
    } else {
      mainPhenomenon = `吉凶混在 (Year:${yPhase}/Month:${mPhase}/Day:${dPhase})`;
    }

    let doyouDetail = isDoyouHazard
      ? `【大凶・土用殺 (${doyouType === "SPRING" ? "春土用" : doyouType === "SUMMER" ? "夏土用" : doyouType === "AUTUMN" ? "秋土用" : "冬土用"})】伝統的に、土地の契約や引越しなど基礎に関わる活動は避けるべきとされます。 `
      : "";

    if (targetClashStatus) {
      // 以前は表に無い凶（月命殺など）が来ると内部コードのまま文中に出ていた。
      const clashName = directionLabelShort(targetClashStatus);
      doyouDetail += `【警告・方位に凶殺】目的地（${ctx.targetDirection}方位）に凶殺「${clashName}」が出ています。年・月・日の巡りが「相生」や「比和」であっても、伝統的にこの方位への移動は避けるべきとされるため推奨しません。 `;
    } else if (isDayWarning) {
      doyouDetail += `【注意・引越当日】年盤・月盤は吉ですが、引越し当日の日盤にだけ凶が重なっています。伝統的に、こうした日は予定に余裕を持って慎重に動くのが良いとされます。引越しなど長期の滞在の吉凶は、主に年盤・月盤で見ます。 `;
    }

    return {
      phenomenon: mainPhenomenon,
      detail:
        doyouDetail +
        `[目的地${ctx.targetDirection}方位の年星:${activeYearStar}(${yPhase})] [月星:${activeMonthStar}(${mPhase})] [日星:${activeDailyStar}(${dPhase})] - 年・月・日の盤の重なりを評価しています。引越し等の長期滞在では年盤・月盤の相生・比和を重く見ます。`,
    };
  }
}
