// @vitest-environment node
/**
 * 物件検索の側でも、天中殺を含まない絞り込みでは期間の禁忌を効かせない。
 *
 * #864 で時期の分析（auspiciousDays）を直したときに、**物件検索
 * （arbitrageAstro）に同じ食い違いが残っていた**。同じ設定で
 * /relocation/timing と /relocation/arbitrage の答えが割れる状態なので、
 * 規則（tenchusatsuPolicy.filterModeUsesTenchusatsu）を共有して揃える。
 *
 * ## このテストの作り（CLAUDE.md 3 節）
 *
 * 1. **旧挙動を写す。**期間の禁忌は evaluateTenchusatsu が唯一の定義元
 *    なので、絞り込みモードを見ない素の答えを参照実装として持つ
 * 2. composite と 天中殺のみ ではそれと一致することを固定（挙動不変）
 * 3. 本命星のみ・環境要因のみでは禁止しないことを固定（新挙動）
 * 4. **空回りしていないことを確かめる。**参照実装が禁止と答える日が
 *    実際に存在すること
 */
import { describe, it, expect } from "vitest";
import {
  buildDailyAstroStates,
  scoreDateForProperty,
} from "@/utils/arbitrageAstro";
import {
  evaluateTenchusatsu,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  type DirectionFilterMode,
} from "@/utils/ephemerisEngine";

/* 午未空亡になる生年月日。2026（丙午）・2027（丁未）が年天中殺に当たる
   ので、strict では禁止側の日が大量に出て検査が空回りしない。
   **運営者の値は使わない**（__tests__/personalDataLeak.test.ts）。 */
const BIRTH = new Date("1990-01-19T12:00:00+09:00");
const LON = 135.768;
const DAYS = 60;

const honmeiStar = getHonmeiStar(BIRTH);
const voidZodiacs = getPersonalVoidZodiac(BIRTH);

function statesFor(mode: DirectionFilterMode) {
  const dates = Array.from(
    { length: DAYS },
    (_, i) => new Date(Date.UTC(2026, 5, 1) + i * 86400000),
  );
  return buildDailyAstroStates(dates, {
    baseLon: LON,
    physicalMonthMode: "independent",
    useClassical: true,
    honmeiStar,
    voidZodiacs,
    actionIntent: "MIGRATION",
    nodeMapping: "traditional",
    directionFilterMode: mode,
    layerMode: "final",
    lunarPhaseModifier: false,
    hasBirthLocation: false,
    bDate: BIRTH,
  });
}

interface Row {
  date: string;
  blocked: boolean;
  reference: boolean;
  status: string;
}

function scan(mode: DirectionFilterMode, tenchusatsuMode: TenchusatsuMode) {
  const rows: Row[] = [];
  for (const state of statesFor(mode)) {
    const day = scoreDateForProperty(state, {
      hasCoordinates: true,
      direction: "E",
      magneticDirection: "E",
      useTrueNorth: true,
      hasSunLine: false,
      hasVenusLine: false,
      hasJupiterLine: false,
      hasBirthLocation: false,
      actionIntent: "MIGRATION",
      tenchusatsuMode,
      directionFilterMode: mode,
    });
    rows.push({
      date: day.date,
      blocked: day.tenchusatsu.blocks,
      // 旧実装の写し。絞り込みモードを一切見ずに期間を判定していた。
      reference: evaluateTenchusatsu(state.voidScopes, tenchusatsuMode, false)
        .blocks,
      status: day.status,
    });
  }
  return rows;
}

describe("物件検索: 絞り込みモードと天中殺（期間）", () => {
  it("空回りしていない（旧実装が禁止していた日が実際にある）", () => {
    const rows = scan("personal_kigaku", "strict");
    expect(rows.filter((r) => r.reference).length).toBeGreaterThan(30);
  });

  it("総合は旧実装と同じ（挙動を変えていない）", () => {
    for (const mode of ["strict", "month_day", "day_only"] as const) {
      const rows = scan("composite", mode);
      expect(rows.map((r) => r.blocked)).toEqual(rows.map((r) => r.reference));
    }
  });

  it("天中殺のみ も旧実装と同じ", () => {
    const rows = scan("personal_bazi", "strict");
    expect(rows.map((r) => r.blocked)).toEqual(rows.map((r) => r.reference));
  });

  it("本命星のみ では禁止しない", () => {
    for (const mode of ["strict", "month_day", "day_only"] as const) {
      const rows = scan("personal_kigaku", mode);
      expect(rows.every((r) => r.blocked === false)).toBe(true);
    }
  });

  it("環境要因のみ でも禁止しない", () => {
    const rows = scan("environmental", "strict");
    expect(rows.every((r) => r.blocked === false)).toBe(true);
  });

  it("禁止しないので、判定が NOISE_TENCHU に倒れない", () => {
    /* 期間の禁忌が効くと status を NOISE_TENCHU に上書きする。
       効かせない設定でそれが残っていたら、画面には「天中殺」と出続ける。 */
    const composite = scan("composite", "strict");
    const kigaku = scan("personal_kigaku", "strict");
    expect(composite.some((r) => r.status === "NOISE_TENCHU")).toBe(true);
    expect(kigaku.every((r) => r.status !== "NOISE_TENCHU")).toBe(true);
  });

  it("渡さなければ従来どおり（既定は composite）", () => {
    const state = statesFor("composite")[0];
    const withMode = scoreDateForProperty(state, {
      hasCoordinates: true,
      direction: "E",
      magneticDirection: "E",
      useTrueNorth: true,
      hasSunLine: false,
      hasVenusLine: false,
      hasJupiterLine: false,
      hasBirthLocation: false,
      actionIntent: "MIGRATION",
      tenchusatsuMode: "strict",
      directionFilterMode: "composite",
    });
    const without = scoreDateForProperty(state, {
      hasCoordinates: true,
      direction: "E",
      magneticDirection: "E",
      useTrueNorth: true,
      hasSunLine: false,
      hasVenusLine: false,
      hasJupiterLine: false,
      hasBirthLocation: false,
      actionIntent: "MIGRATION",
      tenchusatsuMode: "strict",
    });
    expect(without.tenchusatsu.blocks).toBe(withMode.tenchusatsu.blocks);
    expect(without.score).toBe(withMode.score);
  });
});
