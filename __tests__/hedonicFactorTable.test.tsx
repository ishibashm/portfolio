import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  HedonicFactorTable,
  pct,
  scenarioOf,
  yenDelta,
} from "@/components/relocation/HedonicFactorTable";
import type { HedonicModel, PrefectureStats } from "@/utils/marketStats";
import marketStats from "@/data/marketStats.json";
import type { MarketStats } from "@/utils/marketStats";

/**
 * 県別ファクターモデルを暮らしの単位で見せる（利用者の指摘、2026-09-30
 * 「数値だけだと分かりにくい」）。
 *
 * - 場面（駅 10 分・築 10 年・広さ 1.5 倍）は係数から**正確に**換算する。
 *   1 分・1 年の % を 10 倍したものではない（複利になる）
 * - 1 分・1 年の読み下し（effects）と同じ係数から出ていること
 * - 円は県の家賃中央値に当てる
 * - 並べ替えで順が変わる
 */

function model(bSize: number, bAge: number, bStation: number): HedonicModel {
  return {
    beta: [9, bSize, bAge, bStation],
    r2: 0.7,
    n: 1000,
    effects: {
      sizeElasticityPct: (Math.pow(1.1, bSize) - 1) * 100,
      agePctPerYear: (Math.exp(bAge) - 1) * 100,
      stationPctPerMin: (Math.exp(bStation) - 1) * 100,
    },
  };
}

function pref(
  name: string,
  n: number,
  median: number,
  h: HedonicModel | null,
): PrefectureStats {
  return {
    prefecture: name,
    n,
    rent: { median } as PrefectureStats["rent"],
    sqmRent: {} as PrefectureStats["sqmRent"],
    hedonic: h,
    residualHist: [],
    residual: null,
  };
}

afterEach(() => cleanup());

describe("scenarioOf", () => {
  it("係数から場面の変化率を正確に出す（10 倍ではなく複利）", () => {
    const s = scenarioOf(model(0.82, -0.0117, -0.0229));
    expect(s.station10).toBeCloseTo((Math.exp(-0.229) - 1) * 100, 10);
    expect(s.age10).toBeCloseTo((Math.exp(-0.117) - 1) * 100, 10);
    expect(s.size15).toBeCloseTo((Math.pow(1.5, 0.82) - 1) * 100, 10);
    // 1 分の % を 10 倍した値とは違う
    expect(s.station10).not.toBeCloseTo(
      model(0.82, -0.0117, -0.0229).effects.stationPctPerMin * 10,
      1,
    );
  });

  it("本物の集計でも、1 年・1 分の読み下しと同じ係数から出ている", () => {
    const stats = marketStats as unknown as MarketStats;
    for (const p of stats.prefectures) {
      if (!p.hedonic) continue;
      const s = scenarioOf(p.hedonic);
      const e = p.hedonic.effects;
      expect(s.age10).toBeCloseTo(
        (Math.pow(1 + e.agePctPerYear / 100, 10) - 1) * 100,
        6,
      );
      expect(s.station10).toBeCloseTo(
        (Math.pow(1 + e.stationPctPerMin / 100, 10) - 1) * 100,
        6,
      );
    }
  });
});

describe("yenDelta", () => {
  it("万円と千円", () => {
    expect(yenDelta(-25600)).toBe("−2.6万円");
    expect(yenDelta(4200)).toBe("+4千円");
    expect(yenDelta(850)).toBe("+900円");
    expect(yenDelta(-40)).toBe("±0円");
    expect(yenDelta(0)).toBe("±0円");
  });

  it("四捨五入で 0 になる変化率は ±0%（+0% と読ませない）", () => {
    expect(pct(0.17)).toBe("±0%");
    expect(pct(-0.4)).toBe("±0%");
    expect(pct(1.7)).toBe("+2%");
    expect(pct(-20.4)).toBe("−20%");
  });
});

describe("HedonicFactorTable", () => {
  const PREFS = [
    pref("東京都", 200000, 127000, model(0.82, -0.0117, -0.0229)),
    pref("北海道", 80000, 50000, model(0.6, -0.015, -0.0023)),
    pref("鳥取県", 900, 45000, null),
  ];

  const order = () =>
    [...document.querySelectorAll("tbody tr td:first-child")].map(
      (td) => td.querySelector("span")?.textContent,
    );

  it("要点に、駅の近さが最も効く県と円の目安", () => {
    render(<HedonicFactorTable prefectures={PREFS} />);
    const text = document.body.textContent ?? "";
    // 東京: exp(-0.229)-1 = -20.5% → 中央値 12.7 万円で約 2.6 万円
    expect(text).toContain("駅から10分遠いと、家賃は");
    expect(text).toContain("いちばん効く東京都で −20%");
    expect(text).toContain("−2.6万円");
    expect(text).toContain("いちばん効かない北海道は −2%");
    expect(screen.getByText("標本不足")).toBeTruthy();
  });

  it("並べ替えで順が変わる（標本不足は効きの順では最後）", () => {
    render(<HedonicFactorTable prefectures={PREFS} />);
    expect(order()).toEqual(["東京都", "北海道", "鳥取県"]);
    fireEvent.click(screen.getByRole("button", { name: "築年が効く順" }));
    expect(order()).toEqual(["北海道", "東京都", "鳥取県"]);
    expect(
      screen
        .getByRole("button", { name: "築年が効く順" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("当てはまりは R² を百分率で", () => {
    render(<HedonicFactorTable prefectures={PREFS} />);
    const first = document.querySelector("tbody tr")!;
    expect(first.lastElementChild?.textContent).toBe("70%");
  });
});
