/**
 * 物件×日付の吉凶を出す計算を、一覧API (/api/rentals/arbitrage) と
 * タイムラインAPI (/api/rentals/arbitrage/timeline) で共有するためのモジュール。
 *
 * もともと一覧APIの中に直書きされており、返す日数が対象日±3日の 7 日固定だった。
 * そのためヒートマップの 30days / 12months は 7 日分を使い回した偽データを
 * 描いていた。ここを切り出して任意の日付リストを渡せるようにする。
 */
import {
  getCurrentEnvironmentalFrequencies as getSystemEnvironment,
  generateBoard,
  calculateVectorCollision,
  Direction,
  calculateLunarPhaseCondition,
  filterCollisionByMode,
  getCurrentZodiac,
} from "@/utils/ephemerisEngine";
import { getRokuyo, getLuckyDays, isJapaneseHoliday } from "@/utils/lunar";
import { Solar } from "lunar-javascript";

export function isNoiseStatus(status: string): boolean {
  if (!status) return false;
  return (
    status.startsWith("NOISE") &&
    status !== "NOISE_VOID" &&
    status !== "NOISE_NODE"
  );
}

/**
 * 移転の可否として「避けるべき」に倒すべき判定か。
 *
 * isNoiseStatus は方位そのものの凶（五黄殺など）を見るもので、
 * 空亡・月交点は除外している。順位付けで下げる判断はそれより広く、
 * 天中殺（期間の禁止）と空亡も含める。
 */
export function isAvoidStatus(status: string): boolean {
  if (!status) return false;
  return isNoiseStatus(status) || status === "NOISE_TENCHU" || status === "NOISE_VOID";
}

export function calculateBaziCompatibility(
  bDate: Date,
  targetDate: Date,
): number {
  try {
    const birthSolar = Solar.fromDate(bDate);
    const userDayGan = birthSolar.getLunar().getEightChar().getDayGan();
    const targetSolar = Solar.fromDate(targetDate);
    const targetDayGan = targetSolar.getLunar().getEightChar().getDayGan();

    const GAN_WUXING: Record<string, string> = {
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

    const userWuxing = GAN_WUXING[userDayGan];
    const targetWuxing = GAN_WUXING[targetDayGan];
    if (!userWuxing || !targetWuxing) return 50;

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

    if (userWuxing === targetWuxing) return 60;
    if (shengCycle[userWuxing] === targetWuxing) return 70;
    if (shengCycle[targetWuxing] === userWuxing) return 90;
    if (keCycle[userWuxing] === targetWuxing) return 65;
    if (keCycle[targetWuxing] === userWuxing) return 30;
    return 50;
  } catch {
    return 50;
  }
}

export interface AstroStateParams {
  baseLon: number;
  physicalMonthMode: "coupled" | "independent";
  useClassical: boolean;
  honmeiStar: { physical: any; classical: any };
  voidZodiacs: string[];
  actionIntent: any;
  nodeMapping: "traditional" | "physical";
  directionFilterMode: string;
  layerMode: string;
  lunarPhaseModifier: boolean;
  hasBirthLocation: boolean;
  bDate: Date;
}

export interface DailyAstroState {
  date: Date;
  dateStr: string;
  activeVectors: Partial<Record<Direction, string>>;
  isDoyouHazard: boolean;
  lunarPhaseScore: number;
  tendoDir: Direction | undefined;
  rokuyo: string;
  luckyDays: any;
  holiday: any;
  weekday: number;
  isVoidTime: boolean;
  baziScore: number;
}

/** 日付ごとの盤・吉日・天中殺などを一度だけ計算する（物件数には依存しない重い部分） */
export function buildDailyAstroStates(
  dateList: Date[],
  p: AstroStateParams,
): DailyAstroState[] {
  return dateList.map((d) => {
    const env_d = getSystemEnvironment(d, p.baseLon, p.physicalMonthMode);

    let activeVectors_d: Partial<Record<Direction, string>>;
    let tendoDir_d: Direction | undefined;
    let isDoyouHazard_d = false;

    const star = p.useClassical
      ? p.honmeiStar.classical
      : p.honmeiStar.physical;
    const yB = generateBoard(
      p.useClassical ? env_d.classicalYearStar : env_d.yearStar,
    );
    const mB = generateBoard(
      p.useClassical ? env_d.classicalMonthStar : env_d.monthStar,
    );
    const dB = generateBoard(
      p.useClassical ? env_d.classicalDayStar : env_d.dayStar,
    );

    const baseCollision = calculateVectorCollision(
      star,
      yB,
      mB,
      dB,
      p.voidZodiacs,
      env_d.raw.lunarNode,
      p.actionIntent,
      d,
      p.baseLon,
      undefined,
      p.nodeMapping,
    );

    const vectorData = filterCollisionByMode(
      baseCollision,
      star,
      null,
      p.voidZodiacs,
      p.directionFilterMode as any,
      yB,
      mB,
      dB,
    );

    if (p.layerMode === "year") activeVectors_d = vectorData.yearLayer;
    else if (p.layerMode === "month") activeVectors_d = vectorData.monthLayer;
    else if (p.layerMode === "day") activeVectors_d = vectorData.dayLayer;
    else activeVectors_d = vectorData.finalVectors;

    tendoDir_d = vectorData.tendoDirection;
    isDoyouHazard_d = vectorData.doyouState?.isDoyouHazard || false;

    let lunarPhaseScore_d = 0;
    if (p.lunarPhaseModifier) {
      lunarPhaseScore_d = calculateLunarPhaseCondition(
        d,
        "MIGRATION",
      ).scoreModifier;
    }

    const dateStr = d.toISOString().split("T")[0];
    const zodiacs_d = getCurrentZodiac(new Date(dateStr), p.baseLon);
    const isVoidTime_d =
      p.voidZodiacs.includes(zodiacs_d.yearZodiac) ||
      p.voidZodiacs.includes(zodiacs_d.monthZodiac) ||
      p.voidZodiacs.includes(zodiacs_d.dayZodiac);

    return {
      date: d,
      dateStr,
      activeVectors: activeVectors_d,
      isDoyouHazard: isDoyouHazard_d,
      lunarPhaseScore: lunarPhaseScore_d,
      tendoDir: tendoDir_d,
      rokuyo: getRokuyo(d),
      luckyDays: getLuckyDays(d),
      holiday: isJapaneseHoliday(d),
      weekday: d.getDay(),
      isVoidTime: isVoidTime_d,
      baziScore: p.hasBirthLocation
        ? calculateBaziCompatibility(p.bDate, new Date(dateStr))
        : 50,
    };
  });
}

export interface PropertyAstroContext {
  hasCoordinates: boolean;
  direction: Direction | null;
  magneticDirection: Direction | null;
  useTrueNorth: boolean;
  hasSunLine: boolean;
  hasVenusLine: boolean;
  hasJupiterLine: boolean;
  hasBirthLocation: boolean;
  actionIntent: any;
}

/** ある物件の方位で、1 日ぶんの吉凶とスコア内訳を出す（軽い部分） */
export function scoreDateForProperty(
  state: DailyAstroState,
  ctx: PropertyAstroContext,
) {
  let baseAstrologyScore = 50;
  let dailyStatus = "UNKNOWN";
  let dailyIsTendo = false;

  let tendoBonus = 0;
  let sunLineBonus = 0;
  let venusLineBonus = 0;
  let jupiterLineBonus = 0;
  const lunarPhaseScore = state.lunarPhaseScore;
  let doyouPenalty = 0;
  let voidPenalty = 0;

  if (ctx.hasCoordinates) {
    const targetDirection = ctx.useTrueNorth
      ? ctx.direction
      : ctx.magneticDirection;

    if (state.activeVectors && targetDirection) {
      dailyStatus = state.activeVectors[targetDirection] || "UNKNOWN";

      // 1. Tendo (天道) override/shift rules
      const isTendo = state.tendoDir && targetDirection === state.tendoDir;
      if (isTendo) {
        dailyIsTendo = true;
        tendoBonus = 20;
        if (isNoiseStatus(dailyStatus)) dailyStatus = "WARNING";
        else if (dailyStatus === "WARNING") dailyStatus = "SAFE";
      }

      // 2. Jupiter Line (木星ライン) boost
      const isOptimal =
        dailyStatus === "OPTIMAL" || dailyStatus === "OPTIMAL_REGULAR";
      if (isOptimal && ctx.hasJupiterLine) dailyStatus = "OPTIMAL_BOOST";

      switch (dailyStatus) {
        case "OPTIMAL_BOOST":
          baseAstrologyScore = 110;
          break;
        case "OPTIMAL":
          baseAstrologyScore = 100;
          break;
        case "SAFE":
          baseAstrologyScore = 80;
          break;
        case "WARNING":
          baseAstrologyScore = 60;
          break;
        case "NOISE_VOID":
          baseAstrologyScore = 40;
          voidPenalty = -40;
          break;
        case "NOISE_NODE":
          baseAstrologyScore = 40;
          break;
        case "NOISE_HONMEI":
        case "NOISE_TEKI":
        case "NOISE_GETSUMEI":
        case "NOISE_GETSUTEKI":
          baseAstrologyScore = 20;
          break;
        case "NOISE_GOU":
        case "NOISE_ANKEN":
        case "NOISE_HA":
          baseAstrologyScore = 10;
          break;
        default:
          baseAstrologyScore = 50;
          break;
      }
    }

    if (ctx.hasBirthLocation) {
      if (ctx.hasSunLine) sunLineBonus = 15;
      if (ctx.hasVenusLine && baseAstrologyScore >= 50) venusLineBonus = 15;
      if (ctx.hasJupiterLine && baseAstrologyScore >= 50) jupiterLineBonus = 20;
    }

    if (state.isDoyouHazard) doyouPenalty = -30;

    // 3. Time-Gate (天中殺) check
    //
    // ここでスコアを 0 まで落としながら status は方位判定のまま残していたため、
    // 「OPTIMAL（大吉）」と「天中殺期間 (移転NG)」が同時に表示されていた。
    // 移転できない期間なのだから判定そのものを凶に倒す。
    if (state.isVoidTime && ctx.actionIntent === "MIGRATION") {
      voidPenalty = -100; // Time-Gate blocker!
      dailyStatus = "NOISE_TENCHU";
      dailyIsTendo = false;
      tendoBonus = 0;
    }
  }

  // 4. Bazi vs Kigaku Intent-based dynamic weighting
  let blendedAstroScore = baseAstrologyScore;
  if (ctx.hasBirthLocation) {
    const baziScore = state.baziScore;
    if (ctx.actionIntent === "MIGRATION" || ctx.actionIntent === "BUSINESS") {
      blendedAstroScore = baseAstrologyScore * 0.7 + baziScore * 0.3;
    } else {
      blendedAstroScore = baseAstrologyScore * 0.2 + baziScore * 0.8;
    }
  }

  const rawTotalScore =
    blendedAstroScore +
    tendoBonus +
    sunLineBonus +
    venusLineBonus +
    jupiterLineBonus +
    lunarPhaseScore +
    doyouPenalty +
    voidPenalty;
  const dailyScore = Math.max(0, Math.min(100, rawTotalScore));

  const isTaian = state.rokuyo.includes("大安");
  const isTensho = state.luckyDays.isTensho;
  const isIchiryumanbai = state.luckyDays.isIchiryumanbai;

  let luckyCount = 0;
  if (dailyIsTendo) luckyCount++;
  if (isTaian) luckyCount++;
  if (isTensho) luckyCount++;
  if (isIchiryumanbai) luckyCount++;

  const isUltraLucky = (isTensho && dailyIsTendo) || luckyCount >= 3;

  return {
    date: state.dateStr,
    score: dailyScore,
    status: dailyStatus,
    rokuyo: state.rokuyo,
    luckyDays: {
      isIchiryumanbai,
      isTensho,
      isTendo: dailyIsTendo,
      labels: [
        ...(isIchiryumanbai ? ["一粒万倍日"] : []),
        ...(isTensho ? ["天赦日"] : []),
        ...(dailyIsTendo ? ["天道"] : []),
      ],
    },
    isUltraLucky,
    weekday: state.weekday,
    holiday: state.holiday,
    scoreDetails: {
      baseAstrologyScore,
      tendoBonus,
      sunLineBonus,
      venusLineBonus,
      jupiterLineBonus,
      lunarPhaseScore,
      doyouPenalty,
      voidPenalty,
      rawTotalScore,
    },
  };
}
