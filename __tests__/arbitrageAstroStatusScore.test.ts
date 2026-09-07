import { describe, expect, it } from "vitest";
import {
  scoreDateForProperty,
  type DailyAstroState,
  type PropertyAstroContext,
} from "@/utils/arbitrageAstro";
import { getStatusScore } from "@/lib/scoreTier";
import { NOISE_PRIORITY } from "@/utils/noiseSeverity";
import { getLuckyDays, isJapaneseHoliday } from "@/utils/lunar";

/**
 * 物件検索の日別採点（arbitrageAstro）が、状態 → 点の表を
 * lib/scoreTier.getStatusScore から引くことを固定する。
 *
 * 以前はここに 3 つ目の写しがあって、
 *
 *   OPTIMAL_REGULAR（吉方位）… 写しに無く default の 50（平穏 80 より低い）
 *   月命殺・月命的殺          … 20（本命殺と同じ大凶の段）
 *
 * の 2 つが食い違っていた。下に旧実装を写してある。**旧実装に差し替えると
 * 下のテストが落ちる**ことを確認済み。
 */

/** 変更前の switch（そのまま写し）。 */
function oldBaseScore(status: string): number {
  switch (status) {
    case "OPTIMAL_BOOST":
      return 110;
    case "OPTIMAL":
      return 100;
    case "SAFE":
      return 80;
    case "WARNING":
      return 60;
    case "NOISE_VOID":
      return 40;
    case "NOISE_NODE":
      return 40;
    case "NOISE_HONMEI":
    case "NOISE_TEKI":
    case "NOISE_GETSUMEI":
    case "NOISE_GETSUTEKI":
      return 20;
    case "NOISE_GOU":
    case "NOISE_ANKEN":
    case "NOISE_HA":
      return 10;
    default:
      return 50;
  }
}

function stateWith(status: string): DailyAstroState {
  const date = new Date("2026-02-10T03:00:00Z"); // JST 正午
  return {
    date,
    dateStr: "2026-02-10",
    activeVectors: { S: status },
    isDoyouHazard: false,
    doyouSatsuDirection: undefined,
    lunarPhaseScore: 0,
    tendoDir: "N", // 天道は別の方位。緩めが入らない
    rokuyo: "大安 (Taian)",
    luckyDays: getLuckyDays(date),
    holiday: isJapaneseHoliday(date),
    weekday: 2,
    isVoidTime: false,
    voidScopes: { year: false, month: false, day: false },
    baziScore: 50,
  };
}

/** 加点も減点も入らない文脈。点は状態の点そのものになる。 */
const ctx: PropertyAstroContext = {
  hasCoordinates: true,
  direction: "S",
  magneticDirection: "S",
  useTrueNorth: true,
  hasSunLine: false,
  hasVenusLine: false,
  hasJupiterLine: false,
  hasBirthLocation: false,
  actionIntent: "MIGRATION",
};

const STATUSES = [
  "OPTIMAL",
  "OPTIMAL_REGULAR",
  "SAFE",
  "WARNING",
  "UNKNOWN",
  ...NOISE_PRIORITY,
];

/** 天中殺方位だけはここ固有の減点（-40）が付く。 */
function expectedScore(status: string): number {
  const base = getStatusScore(status);
  const penalty = status === "NOISE_VOID" ? -40 : 0;
  return Math.max(0, Math.min(100, base + penalty));
}

describe("物件検索の状態 → 点", () => {
  it("scoreTier の点と一致する（天中殺方位の減点だけが固有）", () => {
    for (const s of STATUSES) {
      const r = scoreDateForProperty(stateWith(s), ctx);
      expect(r.status, s).toBe(s);
      expect(r.score, s).toBe(expectedScore(s));
    }
  });

  it("吉方位（OPTIMAL_REGULAR）は平穏より上。以前は 50 で下だった", () => {
    const reg = scoreDateForProperty(stateWith("OPTIMAL_REGULAR"), ctx).score;
    const safe = scoreDateForProperty(stateWith("SAFE"), ctx).score;
    expect(reg).toBe(90);
    expect(reg).toBeGreaterThan(safe);
    expect(oldBaseScore("OPTIMAL_REGULAR")).toBe(50);
    expect(oldBaseScore("OPTIMAL_REGULAR")).toBeLessThan(oldBaseScore("SAFE"));
  });

  it("旧実装と違うのは 吉方位 と 月命殺・月命的殺 だけ", () => {
    const changed: Record<string, [number, number]> = {};
    for (const s of STATUSES) {
      const before = Math.max(0, Math.min(100, oldBaseScore(s)));
      const after = scoreDateForProperty(stateWith(s), ctx).score;
      // 天中殺方位の減点は前後で同じなので、差分の比較からは外す
      const adj = s === "NOISE_VOID" ? 40 : 0;
      if (before - adj !== after) changed[s] = [before - adj, after];
    }
    expect(changed).toEqual({
      OPTIMAL_REGULAR: [50, 90],
      NOISE_GETSUMEI: [20, 40],
      NOISE_GETSUTEKI: [20, 40],
    });
  });

  it("木星ラインの吉方位は OPTIMAL_BOOST で 100 に張り付く", () => {
    const r = scoreDateForProperty(stateWith("OPTIMAL_REGULAR"), {
      ...ctx,
      hasJupiterLine: true,
    });
    expect(r.status).toBe("OPTIMAL_BOOST");
    expect(r.score).toBe(100);
  });
});
