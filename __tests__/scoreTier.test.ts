import { describe, expect, it } from "vitest";
import {
  SCORE_THRESHOLDS,
  SCORE_TIER_LEGEND,
  scoreTextColor,
  scoreTier,
  scoreTierLabel,
} from "@/lib/scoreTier";

/**
 * 0〜100 の総合スコアを段階に落とすしきい値。
 *
 * SolarTimeClock は同じ判定を数値リテラルで 7 か所に書いており、
 * 6 か所が 80/50/30、1 か所だけ 80/50/20 だった。画面の凡例は
 * 「警告 ≥ 30」なのに、実際の格付けはスコア 20 で「凶」に変わっていた。
 */

describe("総合スコアの段階", () => {
  it("境界そのものは上の段に入る", () => {
    expect(scoreTier(SCORE_THRESHOLDS.excellent)).toBe("excellent");
    expect(scoreTier(SCORE_THRESHOLDS.good)).toBe("good");
    expect(scoreTier(SCORE_THRESHOLDS.caution)).toBe("caution");
  });

  it("境界の 1 つ下は下の段", () => {
    expect(scoreTier(SCORE_THRESHOLDS.excellent - 1)).toBe("good");
    expect(scoreTier(SCORE_THRESHOLDS.good - 1)).toBe("caution");
    expect(scoreTier(SCORE_THRESHOLDS.caution - 1)).toBe("bad");
  });

  it("以前ずれていた 20〜29 は「警告」ではなく「大凶」側", () => {
    // 1 か所だけ >= 20 で「凶」としていた。凡例（≥ 30 で警告）に揃える。
    for (const s of [20, 25, 29]) {
      expect(scoreTier(s), String(s)).toBe("bad");
      expect(scoreTierLabel(s), String(s)).toBe("大凶");
    }
    expect(scoreTierLabel(30)).toBe("警告");
  });

  it("段階は単調（点が上がって段が下がらない）", () => {
    const rank = { bad: 0, caution: 1, good: 2, excellent: 3 };
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const r = rank[scoreTier(s)];
      expect(r, `score=${s}`).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("凡例の数字が実際のしきい値と一致する", () => {
    // 凡例に数字を直書きすると、しきい値を変えたときに嘘になる。
    expect(SCORE_TIER_LEGEND[0].bound).toContain(
      String(SCORE_THRESHOLDS.excellent),
    );
    expect(SCORE_TIER_LEGEND[1].bound).toContain(String(SCORE_THRESHOLDS.good));
    expect(SCORE_TIER_LEGEND[2].bound).toContain(
      String(SCORE_THRESHOLDS.caution),
    );
    expect(SCORE_TIER_LEGEND.map((l) => l.label)).toEqual([
      "大吉",
      "吉",
      "警告",
      "大凶",
    ]);
  });

  it("色は段階ごとに違う", () => {
    const colors = [95, 60, 35, 10].map(scoreTextColor);
    expect(new Set(colors).size).toBe(4);
  });

  it("範囲外でも壊れない", () => {
    expect(scoreTier(1000)).toBe("excellent");
    expect(scoreTier(-50)).toBe("bad");
  });
});
