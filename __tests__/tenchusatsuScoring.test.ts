import { describe, it, expect } from "vitest";
import {
  scoreDateForProperty,
  type DailyAstroState,
  type PropertyAstroContext,
} from "@/utils/arbitrageAstro";

/**
 * 天中殺の効かせ方が、方針の関数だけでなく実際のスコアまで届いているか。
 *
 * evaluateTenchusatsu 単体の試験は tenchusatsuPolicy.test.ts にある。
 * ここで見るのは結線で、モードを渡してもスコアが変わらなければ
 * 画面から設定を変えても何も起きない、という壊れ方を捕まえる。
 */

/** 年天中殺だけに当たっている日。方位は吉（天道）に置いて、差が出るようにする。 */
function voidDay(
  scopes = { year: true, month: false, day: false },
): DailyAstroState {
  return {
    date: new Date("2026-06-15"),
    dateStr: "2026-06-15",
    activeVectors: {},
    isDoyouHazard: false,
    lunarPhaseScore: 0,
    tendoDir: undefined,
    rokuyo: "大安",
    luckyDays: { isTensho: false, isIchiryumanbai: false },
    holiday: null,
    weekday: 1,
    isVoidTime: scopes.year || scopes.month || scopes.day,
    voidScopes: scopes,
    baziScore: 50,
  };
}

const ctx = (
  extra: Partial<PropertyAstroContext> = {},
): PropertyAstroContext => ({
  hasCoordinates: true,
  direction: "N",
  magneticDirection: "N",
  useTrueNorth: true,
  hasSunLine: false,
  hasVenusLine: false,
  hasJupiterLine: false,
  hasBirthLocation: false,
  actionIntent: "MIGRATION",
  ...extra,
});

describe("天中殺の設定がスコアに届く", () => {
  it("既定（厳格）では年天中殺で移転不可になる", () => {
    const r = scoreDateForProperty(voidDay(), ctx());
    expect(r.status).toBe("NOISE_TENCHU");
    expect(r.score).toBe(0);
    expect(r.tenchusatsu.blocks).toBe(true);
  });

  it("年天中殺を除く設定にすると、同じ日が塞がらなくなる", () => {
    const r = scoreDateForProperty(
      voidDay(),
      ctx({ tenchusatsuMode: "month_day" }),
    );
    expect(r.status).not.toBe("NOISE_TENCHU");
    expect(r.score).toBeGreaterThan(0);
    expect(r.tenchusatsu.blocks).toBe(false);
  });

  it("やむを得ない移動なら、厳格のままでも塞がらない", () => {
    const r = scoreDateForProperty(voidDay(), ctx({ involuntaryMove: true }));
    expect(r.tenchusatsu.blocks).toBe(false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.status).not.toBe("NOISE_TENCHU");
  });

  it("弱める設定では禁止せず、スコアが中央（50）へ寄る", () => {
    const strict = scoreDateForProperty(voidDay(), ctx());
    const weaken = scoreDateForProperty(
      voidDay(),
      ctx({ tenchusatsuMode: "weaken" }),
    );
    expect(weaken.tenchusatsu.blocks).toBe(false);
    expect(weaken.score).toBeGreaterThan(strict.score);
    // 中央へ寄せるので、素点がどちらへ振れていても 50 に近づく
    const plain = scoreDateForProperty(
      voidDay({ year: false, month: false, day: false }),
      ctx({ tenchusatsuMode: "weaken" }),
    );
    expect(Math.abs(weaken.score - 50)).toBeLessThanOrEqual(
      Math.abs(plain.score - 50),
    );
  });

  it("空亡でない日は、どのモードでも同じスコアになる", () => {
    const none = voidDay({ year: false, month: false, day: false });
    const base = scoreDateForProperty(none, ctx()).score;
    for (const mode of ["month_day", "day_only", "weaken", "off"] as const) {
      expect(scoreDateForProperty(none, ctx({ tenchusatsuMode: mode })).score).toBe(
        base,
      );
    }
  });

  it("移転以外の用途では、厳格でも移転不可の判定を出さない", () => {
    const r = scoreDateForProperty(voidDay(), ctx({ actionIntent: "TRAVEL" }));
    expect(r.status).not.toBe("NOISE_TENCHU");
  });
});
