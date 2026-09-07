import { ratingForStatus } from "@/lib/verdictRating";
import { isFatalNoise } from "@/utils/noiseSeverity";

/**
 * 引越し履歴の「月まで分かっている」記録の判定。年盤と月盤を 1 語に畳む。
 *
 * ## 五大凶殺は点で相殺しない
 *
 * 以前は五黄殺・暗剣殺・破の 3 つだけを先に見て、本命殺・本命的殺は
 * 点の足し算に回していた。本命殺（−100）と大吉（+100）が足されて 0 に
 * なると、`total < 0` でも `total > 0` でもないので初期値の "SAFE" が
 * 残り、**本命殺の年の移転が「平穏」**と出ていた。
 *
 * 五大凶殺の集合は utils/noiseSeverity の 1 か所から引く（#698・#712 で
 * 評価を 1 系統にした置き場）。ここに写しを持たない。
 *
 * ## 打ち消し合ったら悪いほうを採る
 *
 * 五大凶殺でない凶と吉が足して 0 になったときも、"SAFE" に落とさず
 * 点の低い側を採る。「凶があった」という事実を平穏に丸めない。
 */
export function aggregateMonthStatus(yStatus: string, mStatus: string): string {
  if (isFatalNoise(yStatus)) return yStatus;
  if (isFatalNoise(mStatus)) return mStatus;

  const yScore = ratingForStatus(yStatus).score;
  const mScore = ratingForStatus(mStatus).score;
  const total = yScore + mScore;

  if (total > 0) {
    return yStatus === "OPTIMAL" || mStatus === "OPTIMAL"
      ? "OPTIMAL"
      : "OPTIMAL_REGULAR";
  }
  // total <= 0: 点の低い側（同点なら年盤）
  return yScore <= mScore ? yStatus : mStatus;
}
