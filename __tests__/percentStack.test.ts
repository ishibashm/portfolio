import { describe, expect, it } from "vitest";
import { toPercentStack } from "@/utils/percentStack";

/**
 * 「横軸の目盛りが 100.100000000000019% になる」という利用者報告の再現。
 *
 * 旧実装は段階ごとに toFixed(1) してから積み上げていた。丸めてから足すと
 * 誤差が積み上がり、合計が 100 を超える。Recharts は domain={[0, 100]} を
 * 渡してもデータがそれを超えると軸を最大値まで伸ばすので、その 100.1 が
 * そのまま目盛りに出ていた（0.1 刻みの二進小数を 6 個足した桁つきで）。
 */

const TIERS = ["S", "A", "B", "C", "D", "X"] as const;
type Tier = (typeof TIERS)[number];

/** 旧実装。段階ごとに 1 桁で丸めてから積み上げる。 */
function legacyStack(counts: Record<Tier, number>): number[] {
  const total = TIERS.reduce((a, t) => a + counts[t], 0) || 1;
  return TIERS.map((t) => Number(((counts[t] / total) * 100).toFixed(1)));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 6 段階に 1 日ずつ。1 つあたり 16.666…% で、丸めると 16.7 になる。 */
const EVEN_SIX: Record<Tier, number> = { S: 1, A: 1, B: 1, C: 1, D: 1, X: 1 };

/**
 * 報告された画面と同じ形。15 日のうち 13 日が五大凶殺で、平と軽い凶が
 * 1 日ずつ（スクリーンショットの「南」の行はほぼ全部が赤だった）。
 * 6.7 + 6.7 + 86.7 = 100.1 で、しかも二進小数の端数が残る。
 */
const MOSTLY_X: Record<Tier, number> = { S: 0, A: 0, B: 0, C: 1, D: 1, X: 13 };

describe("旧実装が 100 を超えていたこと", () => {
  it("6 等分だと合計が 100.2 になる", () => {
    expect(sum(legacyStack(EVEN_SIX))).toBeCloseTo(100.2, 10);
  });

  it("報告された形では合計が 100.1 になり、端数の桁が残る", () => {
    const total = sum(legacyStack(MOSTLY_X));
    expect(total).toBeGreaterThan(100);
    // Recharts は domain={[0,100]} を渡してもデータが超えると軸を最大値まで
    // 伸ばす。その最大値がこの数で、文字列にすると桁が並ぶ
    expect(String(total)).toBe("100.10000000000001");
  });
});

describe("toPercentStack", () => {
  it("6 等分でも合計はちょうど 100", () => {
    const got = toPercentStack(EVEN_SIX, TIERS);
    expect(sum(TIERS.map((t) => got[t]))).toBe(100);
  });

  it("端数は大きいものから配る（16 が 2 つ、17 が 4 つ）", () => {
    const got = toPercentStack(EVEN_SIX, TIERS);
    expect(TIERS.map((t) => got[t])).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it("どの段階も本来の割合との差が 1 未満", () => {
    const counts: Record<Tier, number> = {
      S: 3,
      A: 0,
      B: 11,
      C: 47,
      D: 5,
      X: 89,
    };
    const total = TIERS.reduce((a, t) => a + counts[t], 0);
    const got = toPercentStack(counts, TIERS);
    for (const t of TIERS) {
      expect(Math.abs(got[t] - (counts[t] / total) * 100)).toBeLessThan(1);
    }
    expect(sum(TIERS.map((t) => got[t]))).toBe(100);
  });

  it("1 つの段階に全部寄っていれば 100 と 0", () => {
    const got = toPercentStack({ S: 0, A: 0, B: 0, C: 0, D: 0, X: 12 }, TIERS);
    expect(got.X).toBe(100);
    expect(got.S).toBe(0);
  });

  it("整数にならない実際の並びでも必ず 100（乱数で総当たり）", () => {
    let seed = 20260829;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 500; i++) {
      const counts = Object.fromEntries(
        TIERS.map((t) => [t, Math.floor(next() * 60)]),
      ) as Record<Tier, number>;
      const got = toPercentStack(counts, TIERS);
      const total = TIERS.reduce((a, t) => a + counts[t], 0);
      expect(sum(TIERS.map((t) => got[t]))).toBe(total > 0 ? 100 : 0);
    }
  });

  it("走査結果が空なら全部 0（0 件を 100% に配らない）", () => {
    const got = toPercentStack({ S: 0, A: 0, B: 0, C: 0, D: 0, X: 0 }, TIERS);
    expect(TIERS.map((t) => got[t])).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
