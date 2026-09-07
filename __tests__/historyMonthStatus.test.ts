import { describe, expect, it } from "vitest";
import { aggregateMonthStatus } from "@/lib/historyMonthStatus";
import { ratingForStatus } from "@/lib/verdictRating";

/**
 * 月まで分かっている記録の、年盤 + 月盤の畳み方。
 *
 * 以前の実装（api/relocation/history に直書き）は五黄殺・暗剣殺・破の
 * 3 つだけを先に見ていて、本命殺・本命的殺は点の足し算に回していた。
 * 本命殺（−100）+ 大吉（+100）= 0 は初期値の "SAFE" に落ちていた。
 */
function legacy(yStatus: string, mStatus: string): string {
  let finalStatus = "SAFE";
  const yScore = ratingForStatus(yStatus).score;
  const mScore = ratingForStatus(mStatus).score;
  const total = yScore + mScore;
  if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(yStatus)) {
    finalStatus = yStatus;
  } else if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(mStatus)) {
    finalStatus = mStatus;
  } else if (total < 0) {
    finalStatus = yScore < mScore ? yStatus : mStatus;
  } else if (total > 0) {
    finalStatus =
      yStatus === "OPTIMAL" || mStatus === "OPTIMAL"
        ? "OPTIMAL"
        : "OPTIMAL_REGULAR";
  }
  return finalStatus;
}

describe("aggregateMonthStatus", () => {
  it("五大凶殺は 5 つとも点で相殺せず、そのまま残す", () => {
    for (const fatal of [
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_HONMEI",
      "NOISE_TEKI",
    ]) {
      expect(aggregateMonthStatus(fatal, "OPTIMAL"), fatal).toBe(fatal);
      expect(aggregateMonthStatus("OPTIMAL", fatal), fatal).toBe(fatal);
    }
  });

  it("旧実装は本命殺 + 大吉（合計 0）を「平穏」にしていた", () => {
    expect(legacy("NOISE_HONMEI", "OPTIMAL")).toBe("SAFE");
    expect(legacy("OPTIMAL", "NOISE_TEKI")).toBe("SAFE");
    expect(aggregateMonthStatus("NOISE_HONMEI", "OPTIMAL")).toBe(
      "NOISE_HONMEI",
    );
    expect(aggregateMonthStatus("OPTIMAL", "NOISE_TEKI")).toBe("NOISE_TEKI");
  });

  it("吉どうしは大吉があれば大吉、無ければ吉", () => {
    expect(aggregateMonthStatus("OPTIMAL", "SAFE")).toBe("OPTIMAL");
    expect(aggregateMonthStatus("OPTIMAL_REGULAR", "SAFE")).toBe(
      "OPTIMAL_REGULAR",
    );
    expect(aggregateMonthStatus("SAFE", "SAFE")).toBe("SAFE");
  });

  it("五大凶殺でない凶が吉と打ち消し合っても、平穏に丸めない", () => {
    const secondary = "NOISE_GETSUMEI";
    const s = ratingForStatus(secondary).score;
    // 相手の点が同じ大きさなら合計 0。旧実装は "SAFE" に落ちていた
    const partner =
      s === -100 ? "OPTIMAL" : s === -50 ? "OPTIMAL_REGULAR" : null;
    if (partner) {
      expect(legacy(secondary, partner)).toBe("SAFE");
      expect(aggregateMonthStatus(secondary, partner)).toBe(secondary);
    }
    // 単独なら常に凶が残る
    expect(aggregateMonthStatus(secondary, "SAFE")).toBe(secondary);
  });
});
