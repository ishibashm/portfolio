/**
 * 0〜100 の総合スコアを段階に落とす、唯一のしきい値。
 *
 * SolarTimeClock は同じ意味の判定を数値リテラルで 7 か所に書いていた。
 * 6 か所は 80 / 50 / 30 だが、1 か所だけ 80 / 50 / 20 になっており
 * （画面の凡例は「警告 ≥ 30」と書いてあるのに、実際の格付けは
 * スコア 20 で「凶」に変わっていた）、凡例と表示が食い違っていた。
 *
 * 方位そのものの評価は lib/verdictRating（状態コードから引く）、
 * 日付の格付けは utils/tierDisplay（S〜X）が持つ。ここが扱うのは
 * 「複数の要素を合成した 0〜100 の点」だけで、役割が違う。
 */

/**
 * 判定ステータス（OPTIMAL / SAFE / NOISE_〜）を 0〜100 の点に落とす。
 *
 * SolarTimeClock の中に置かれていたが、総合スコアタブの分割
 * （home/ScorecardPanel）で両方のファイルが使うようになったので
 * ここへ移した。中身は 1 文字も変えていない。値は判定の見え方を
 * 決める数字なので触らない（CLAUDE.md 3 節）。
 */
export const getStatusScore = (status: string) => {
  if (!status) return 50;
  if (status === "OPTIMAL") return 100;
  if (status === "OPTIMAL_REGULAR") return 90;
  if (status === "SAFE") return 80;
  if (status === "WARNING") return 60;
  if (status.startsWith("NOISE_VOID") || status.startsWith("NOISE_NODE"))
    return 40;
  if (
    status.startsWith("NOISE_HONMEI") ||
    status.startsWith("NOISE_TEKI") ||
    status.startsWith("NOISE_GETSUMEI") ||
    status.startsWith("NOISE_GETSUTEKI")
  )
    return 20;
  if (
    status.startsWith("NOISE_GOU") ||
    status.startsWith("NOISE_ANKEN") ||
    status.startsWith("NOISE_HA")
  )
    return 10;
  return 50;
};

export const SCORE_THRESHOLDS = {
  /** これ以上なら大吉 */
  excellent: 80,
  /** これ以上なら吉 */
  good: 50,
  /** これ以上なら警告。下回ると大凶 */
  caution: 30,
} as const;

export type ScoreTier = "excellent" | "good" | "caution" | "bad";

export function scoreTier(score: number): ScoreTier {
  if (score >= SCORE_THRESHOLDS.excellent) return "excellent";
  if (score >= SCORE_THRESHOLDS.good) return "good";
  if (score >= SCORE_THRESHOLDS.caution) return "caution";
  return "bad";
}

/**
 * 画面に出す言葉。凡例と本文で同じ語を使う。
 *
 * 「警告」の段は、以前ひとつの箇所だけ「凶」と書かれていた。
 * この段はスコアが低いだけで、五大凶殺のような確定した凶ではない。
 * 凶の語は状態コードから引く側（verdictRating / directionLabels）に任せる。
 */
export const SCORE_TIER_LABEL: Record<ScoreTier, string> = {
  excellent: "大吉",
  good: "吉",
  caution: "警告",
  bad: "大凶",
};

export function scoreTierLabel(score: number): string {
  return SCORE_TIER_LABEL[scoreTier(score)];
}

/**
 * スコアの数字に付ける文字色。
 * 同じ三項演算子が 4 か所に写しで書かれていた。
 */
export function scoreTextColor(score: number): string {
  switch (scoreTier(score)) {
    case "excellent":
      return "text-emerald-600";
    case "good":
      return "text-blue-600";
    case "caution":
      return "text-yellow-500";
    default:
      return "text-red-500";
  }
}

/** 凡例に出す「≥ 80」などの表記。しきい値を凡例に直書きしないため。 */
export const SCORE_TIER_LEGEND: { label: string; bound: string }[] = [
  { label: "大吉", bound: `≥ ${SCORE_THRESHOLDS.excellent}` },
  { label: "吉", bound: `≥ ${SCORE_THRESHOLDS.good}` },
  { label: "警告", bound: `≥ ${SCORE_THRESHOLDS.caution}` },
  { label: "大凶", bound: "その他" },
];
