import { describe, expect, it } from "vitest";
import {
  computeDeterministicTelemetry,
  lunarIlluminationPercent,
  parseXrayFlux,
} from "@/lib/telemetrySnapshot";

describe("履歴グラフの値", () => {
  it("日付だけで 8 系列すべてが数値になる", () => {
    // 以前は API が kpIndex と magneticF しか返しておらず、
    // 5 つのグラフのうち 3 つが完全に空だった。
    const t = computeDeterministicTelemetry(new Date("2026-08-07T12:00:00Z"));
    for (const [k, v] of Object.entries(t)) {
      expect(Number.isFinite(v), `${k}=${v}`).toBe(true);
    }
  });

  it("黄経は 0〜360 度に収まる", () => {
    const t = computeDeterministicTelemetry(new Date("2026-08-07T12:00:00Z"));
    for (const k of ["sunLon", "moonLon", "jupiterLon", "lunarNode"] as const) {
      expect(t[k], k).toBeGreaterThanOrEqual(0);
      expect(t[k], k).toBeLessThan(360);
    }
  });

  it("九星は 1〜9", () => {
    // 1 年ぶん見て、範囲外が出ないこと。
    for (let d = 0; d < 365; d += 7) {
      const date = new Date(Date.UTC(2026, 0, 1 + d, 3));
      const t = computeDeterministicTelemetry(date);
      for (const k of ["yearStar", "monthStar", "dayStar"] as const) {
        expect(t[k], `${k} @${date.toISOString()}`).toBeGreaterThanOrEqual(1);
        expect(t[k], `${k} @${date.toISOString()}`).toBeLessThanOrEqual(9);
      }
    }
  });

  it("日が変われば値も変わる（定数を返していない）", () => {
    const a = computeDeterministicTelemetry(new Date("2026-08-07T12:00:00Z"));
    const b = computeDeterministicTelemetry(new Date("2026-08-21T12:00:00Z"));
    expect(a.moonLon).not.toBe(b.moonLon);
    expect(a.sunLon).not.toBe(b.sunLon);
    expect(a.lunarIllumination).not.toBe(b.lunarIllumination);
  });
});

describe("月の照度", () => {
  it("新月で 0%、満月で 100%", () => {
    expect(lunarIlluminationPercent(0, 0)).toBeCloseTo(0, 6);
    expect(lunarIlluminationPercent(0, 180)).toBeCloseTo(100, 6);
    expect(lunarIlluminationPercent(120, 120)).toBeCloseTo(0, 6);
    expect(lunarIlluminationPercent(350, 170)).toBeCloseTo(100, 6);
  });

  it("上弦・下弦で 50%", () => {
    expect(lunarIlluminationPercent(0, 90)).toBeCloseTo(50, 6);
    expect(lunarIlluminationPercent(0, 270)).toBeCloseTo(50, 6);
  });

  it("常に 0〜100 に収まる", () => {
    for (let s = 0; s < 360; s += 17) {
      for (let m = 0; m < 360; m += 23) {
        const v = lunarIlluminationPercent(s, m);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("X線フラックスの等級", () => {
  it("等級文字列を W/m² にする", () => {
    expect(parseXrayFlux("C1.2")).toBeCloseTo(1.2e-6, 12);
    expect(parseXrayFlux("M5")).toBeCloseTo(5e-5, 12);
    expect(parseXrayFlux("X1")).toBeCloseTo(1e-4, 12);
    expect(parseXrayFlux("B3.4")).toBeCloseTo(3.4e-7, 12);
    expect(parseXrayFlux("a2")).toBeCloseTo(2e-8, 12);
  });

  it("係数が無ければ 1 とみなす", () => {
    expect(parseXrayFlux("C")).toBeCloseTo(1e-6, 12);
  });

  it("数値で来たらそのまま", () => {
    expect(parseXrayFlux("1.5e-6")).toBeCloseTo(1.5e-6, 12);
    expect(parseXrayFlux(2.5e-7)).toBeCloseTo(2.5e-7, 12);
  });

  it("NOAA 由来の等級文字列も読む", () => {
    // fetchSpaceWeather は数値を "B-CLASS" に丸めてから捨てていた。
    // 過去の記録がこの形なので読めるようにしておく。
    expect(parseXrayFlux("B-CLASS")).toBeCloseTo(1e-7, 12);
    expect(parseXrayFlux("C-CLASS")).toBeCloseTo(1e-6, 12);
    expect(parseXrayFlux("X-CLASS")).toBeCloseTo(1e-4, 12);
    expect(parseXrayFlux("m-class")).toBeCloseTo(1e-5, 12);
  });

  it("欠測は null。グラフを NaN で壊さない", () => {
    for (const v of [null, undefined, "", "  ", "不明", "Z9"]) {
      expect(parseXrayFlux(v as string | null), String(v)).toBeNull();
    }
  });
});
