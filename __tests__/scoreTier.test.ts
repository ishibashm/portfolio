import { describe, expect, it } from "vitest";
import {
  SCORE_THRESHOLDS,
  SCORE_TIER_LEGEND,
  scoreCellClass,
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

/* ------------------------------------------------------------------ *
 * 升目の塗り（scoreCellClass）
 *
 * 総合スコアの升目は「トリプル大吉なら緑・位相差警告なら橙」を段階
 * より先に返していた。どちらも凡例が別の意味に使っている色で、点が
 * 8 の升目が「警告（≥ 30）」の橙で出ていた（利用者の画面で確認）。
 * 地色は段階だけが決める形に戻し、印は枠線（ring）で示す。
 *
 * 下に旧実装を写してある。**旧実装に差し替えると下のテストが落ちる**
 * ことを確認済み（空回りするテストを避けるため）。
 * ------------------------------------------------------------------ */

/** 変更前の実装（そのまま写し）。 */
function oldCellClass(
  score: number,
  isConsensus?: boolean,
  isDivergence?: boolean,
): string {
  if (isConsensus)
    return "bg-emerald-50 text-emerald-600 border border-emerald-200";
  if (isDivergence) return "bg-amber-50 text-amber-500 border border-amber-200";
  switch (scoreTier(score)) {
    case "excellent":
      return "bg-emerald-50 text-emerald-600 border border-emerald-200";
    case "good":
      return "bg-blue-50 text-blue-600 border border-blue-200";
    case "caution":
      return "bg-amber-50 text-amber-500 border border-amber-200";
    default:
      return "bg-red-50 text-red-600 border border-red-200";
  }
}

/** 段階ごとの地色。凡例の升と同じもの。 */
const TIER_BG: Record<string, string> = {
  excellent: "bg-emerald-50",
  good: "bg-blue-50",
  caution: "bg-amber-50",
  bad: "bg-red-50",
};

describe("升目の塗り", () => {
  it("地色は 0〜100 のどの点でも段階と一致する（印が付いていても）", () => {
    for (let score = 0; score <= 100; score++) {
      const want = TIER_BG[scoreTier(score)];
      for (const marker of [
        undefined,
        { consensus: true },
        { divergence: true },
        { consensus: true, divergence: true },
      ]) {
        expect(
          scoreCellClass(score, marker),
          `${score} ${JSON.stringify(marker)}`,
        ).toContain(want);
      }
    }
  });

  it("印が付いた升目でも、凡例と違う段階の地色にならない", () => {
    // 利用者の画面に出ていた実例。点 8 は大凶なので赤。以前は橙だった。
    expect(scoreCellClass(8, { divergence: true })).toContain("bg-red-50");
    expect(oldCellClass(8, false, true)).toContain("bg-amber-50");

    // 27 も 30 未満なので大凶。以前は 33（本当の警告）と同じ橙だった。
    expect(scoreCellClass(27, { divergence: true })).toContain("bg-red-50");
    expect(scoreCellClass(33, { divergence: true })).toContain("bg-amber-50");

    // トリプル大吉でも、点が低ければ緑にはしない。
    expect(scoreCellClass(10, { consensus: true })).toContain("bg-red-50");
    expect(oldCellClass(10, true, false)).toContain("bg-emerald-50");
  });

  it("印は枠線で残す（情報を落としていない）", () => {
    expect(scoreCellClass(8, { divergence: true })).toContain("ring-amber-500");
    expect(scoreCellClass(90, { consensus: true })).toContain(
      "ring-emerald-500",
    );
    expect(scoreCellClass(90)).not.toContain("ring-");
  });

  it("印が無いときの塗りは、段階の部分だけ見れば旧実装と同じ段に落ちる", () => {
    // 色の濃さ（-600 → -700）は変えたが、段の割り当ては変えていない。
    for (let score = 0; score <= 100; score++) {
      const bg = TIER_BG[scoreTier(score)];
      expect(oldCellClass(score), String(score)).toContain(bg);
      expect(scoreCellClass(score), String(score)).toContain(bg);
    }
  });
});

describe("升目と数字の文字色が地色に対して読める", () => {
  function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(fg: string, bg: string): number {
    const a = luminance(fg);
    const b = luminance(bg);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  }

  // Tailwind の実際の値。クラス名から色は引けないので写す。
  const HEX: Record<string, string> = {
    "emerald-50": "#ecfdf5",
    "emerald-700": "#047857",
    "blue-50": "#eff6ff",
    "blue-700": "#1d4ed8",
    "amber-50": "#fffbeb",
    "amber-700": "#b45309",
    "red-50": "#fef2f2",
    "red-700": "#b91c1c",
    white: "#ffffff",
    "yellow-700": "#a16207",
    "red-600": "#dc2626",
    "blue-600": "#2563eb",
  };

  it("升目の文字色は地色に対して 4.5:1 以上", () => {
    for (const [fg, bg] of [
      ["emerald-700", "emerald-50"],
      ["blue-700", "blue-50"],
      ["amber-700", "amber-50"],
      ["red-700", "red-50"],
    ]) {
      expect(
        contrast(HEX[fg], HEX[bg]),
        `${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("scoreTextColor の 4 色は白地に対して 4.5:1 以上", () => {
    // 以前は警告が yellow-500（1.9:1）、大凶が red-500（3.8:1）だった。
    for (const cls of [
      scoreTextColor(90),
      scoreTextColor(60),
      scoreTextColor(35),
      scoreTextColor(5),
    ]) {
      const name = cls.replace("text-", "");
      expect(HEX[name], `${name} の実値をこの表に足すこと`).toBeDefined();
      expect(contrast(HEX[name], HEX.white), cls).toBeGreaterThanOrEqual(4.5);
    }
  });
});
