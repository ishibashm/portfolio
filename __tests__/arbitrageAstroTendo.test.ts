import { describe, expect, it } from "vitest";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
  TENDO_SOFTENED_NOISES,
  type DailyAstroState,
} from "@/utils/arbitrageAstro";
import { getHonmeiStar } from "@/utils/ephemerisEngine";
import { getLuckyDays, isJapaneseHoliday } from "@/utils/lunar";
import { directionBoardInstant } from "@/utils/boardInstant";

/**
 * 物件検索の日別判定（arbitrageAstro）が、判定エンジンと同じ規則で
 * 動いていることを固定する。2 つ。
 *
 *   1. 天道が緩めるのは本命殺・本命的殺・月命殺・月命的殺の 4 つだけ。
 *      五黄殺・暗剣殺・破は緩めない（ephemerisEngine の天道の上書きと
 *      同じ集合。画面も「五黄殺・暗剣殺・破・天中殺は対象外」と案内）
 *   2. 盤は日本時間の正午で引く（boardInstant の約束）
 */

function stateWith(
  activeVectors: DailyAstroState["activeVectors"],
  tendoDir: DailyAstroState["tendoDir"],
): DailyAstroState {
  const date = new Date("2026-02-10T03:00:00Z"); // JST 正午
  return {
    date,
    dateStr: "2026-02-10",
    activeVectors,
    isDoyouHazard: false,
    doyouSatsuDirection: undefined,
    lunarPhaseScore: 0,
    tendoDir,
    rokuyo: "大安 (Taian)",
    luckyDays: getLuckyDays(date),
    holiday: isJapaneseHoliday(date),
    weekday: 2,
    isVoidTime: false,
    voidScopes: { year: false, month: false, day: false },
    baziScore: 50,
  };
}

const ctx = {
  hasCoordinates: true,
  direction: "S" as const,
  magneticDirection: "S" as const,
  useTrueNorth: true,
  hasSunLine: false,
  hasVenusLine: false,
  hasJupiterLine: false,
  hasBirthLocation: false,
  actionIntent: "MIGRATION" as const,
};

describe("天道が緩める凶の集合", () => {
  it("五黄殺・暗剣殺・破は天道でも緩めない", () => {
    for (const fatal of ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"]) {
      const r = scoreDateForProperty(stateWith({ S: fatal }, "S"), ctx);
      expect(r.status, fatal).toBe(fatal);
      // 以前は WARNING（60 点）に化けて天道の 20 点まで付き、80 点だった
      expect(r.score, fatal).toBeLessThan(60);
    }
  });

  it("本命殺・本命的殺・月命殺・月命的殺は天道で「注意」に緩める", () => {
    for (const soft of TENDO_SOFTENED_NOISES) {
      const r = scoreDateForProperty(stateWith({ S: soft }, "S"), ctx);
      expect(r.status, soft).toBe("WARNING");
    }
  });

  it("天道でない方位では何も緩めない", () => {
    const r = scoreDateForProperty(stateWith({ S: "NOISE_HONMEI" }, "N"), ctx);
    expect(r.status).toBe("NOISE_HONMEI");
  });
});

describe("盤を引く時刻", () => {
  it("UTC 0 時（JST 9 時）の日付を渡しても、正午の盤と同じ答えになる", () => {
    /*
      2027-02-04 の立春は 10:46 JST。一覧 API は "2027-02-04" を
      UTC 0 時（JST 9 時）にして渡してくるので、以前はこの日だけ
      前の年盤（2026 中宮一白）で判定していた。正午（2027 中宮九紫）に
      揃っていることを、正午の Date を渡した結果と突き合わせる。
    */
    const bDate = new Date("1990-05-15T03:00:00Z");
    const params = {
      baseLon: 139.6917,
      physicalMonthMode: "independent" as const,
      useClassical: true,
      honmeiStar: getHonmeiStar(bDate),
      voidZodiacs: [],
      actionIntent: "MIGRATION" as const,
      nodeMapping: "traditional" as const,
      directionFilterMode: "composite" as const,
      layerMode: "year",
      lunarPhaseModifier: false,
      hasBirthLocation: false,
      bDate,
    };
    const fromUtcMidnight = buildDailyAstroStates(
      [new Date("2027-02-04")],
      params,
    )[0];
    const fromNoon = buildDailyAstroStates(
      [directionBoardInstant(new Date("2027-02-04T03:00:00Z"), 0, 139.6917)],
      params,
    )[0];
    expect(fromUtcMidnight.activeVectors).toEqual(fromNoon.activeVectors);
    expect(fromUtcMidnight.dateStr).toBe("2027-02-04");
  });
});
