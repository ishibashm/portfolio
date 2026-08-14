import { describe, expect, it } from "vitest";
import {
  compareKigakuThenRent,
  kigakuRank,
  UNKNOWN_KIGAKU_RANK,
} from "../src/lib/arbitrageRanking";

/**
 * 一覧の並び順「吉凶の段階 → 家賃の安い順」の固定。
 *
 * 以前は総合スコア（11 軸の加重平均）の高い順だった。評価軸と重みを
 * 廃止したので、並びの一義は方位の吉凶。**旧規則（総合スコア順）に
 * 戻すと、下の「旧規則では逆になる」テストが落ちる。**
 */
describe("kigakuRank", () => {
  it("段階の順に並ぶ（S が最上位）", () => {
    const ranks = ["S", "A", "B", "C", "D", "X"].map((tier) =>
      kigakuRank({ tier }),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(6);
  });

  it("判定が無いものは平（C）の下・凶（D）の上", () => {
    expect(kigakuRank(null)).toBe(UNKNOWN_KIGAKU_RANK);
    expect(kigakuRank(undefined)).toBe(UNKNOWN_KIGAKU_RANK);
    expect(kigakuRank({ tier: null })).toBe(UNKNOWN_KIGAKU_RANK);
    expect(kigakuRank({ tier: "C" })).toBeLessThan(UNKNOWN_KIGAKU_RANK);
    expect(kigakuRank({ tier: "D" })).toBeGreaterThan(UNKNOWN_KIGAKU_RANK);
  });

  it("天中殺で塞がっている方位は段階に関わらず X と同じ", () => {
    // 地図の扇形・県塗りが段階に関わらず灰色にしているのと同じ物差し。
    expect(kigakuRank({ tier: "S", blocked: true })).toBe(
      kigakuRank({ tier: "X" }),
    );
  });

  it("知らない段階の文字列は判定なしとして扱う", () => {
    expect(kigakuRank({ tier: "Z" })).toBe(UNKNOWN_KIGAKU_RANK);
  });
});

describe("compareKigakuThenRent", () => {
  const item = (kigakuRank: number, totalRent: number | null) => ({
    kigakuRank,
    totalRent,
  });

  it("段階が違えば段階で決まる（家賃は見ない）", () => {
    // 旧規則（総合スコア順）では、条件の良い高額物件が凶方位でも
    // 上に出得た。新規則では段階が先に決まる。
    const sGoodButExpensive = item(kigakuRank({ tier: "S" }), 200000);
    const dCheap = item(kigakuRank({ tier: "D" }), 40000);
    expect(compareKigakuThenRent(sGoodButExpensive, dCheap)).toBeLessThan(0);
  });

  it("同じ段階なら家賃の安い順", () => {
    const cheap = item(0, 60000);
    const pricey = item(0, 90000);
    expect(compareKigakuThenRent(cheap, pricey)).toBeLessThan(0);
    expect(compareKigakuThenRent(pricey, cheap)).toBeGreaterThan(0);
  });

  it("家賃が取れていない行は同じ段階の最後", () => {
    // 0 円として先頭に出すと、未取得の行が常に「最安」を名乗る。
    expect(
      compareKigakuThenRent(item(0, null), item(0, 999999)),
    ).toBeGreaterThan(0);
    expect(
      compareKigakuThenRent(item(0, NaN), item(0, 999999)),
    ).toBeGreaterThan(0);
  });

  it("旧規則（総合スコア順）では逆になる並びを固定する", () => {
    // 総合スコアは方位・広さ・駅などの加重平均で、凶方位でも他の軸が
    // 良ければ高く出た。この 2 件は旧規則なら high が上、新規則なら
    // safe が上。旧規則に戻すとこのテストが落ちる。
    const withScore = (
      rank: number,
      totalRent: number,
      totalScore: number,
    ) => ({ kigakuRank: rank, totalRent, totalScore });
    const safeButPlain = withScore(kigakuRank({ tier: "B" }), 70000, 48);
    const noisyButHighScore = withScore(kigakuRank({ tier: "X" }), 65000, 82);

    const sorted = [noisyButHighScore, safeButPlain].sort(
      compareKigakuThenRent,
    );
    expect(sorted[0]).toBe(safeButPlain);

    // 旧規則そのもの（高スコア順）だと逆になることも明示しておく。
    const oldRule = [...sorted].sort((a, b) => b.totalScore - a.totalScore);
    expect(oldRule[0]).toBe(noisyButHighScore);
  });
});
