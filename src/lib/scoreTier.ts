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
      // 以前は emerald-600（白地に 3.8:1）。emerald-700 で 5.4:1。
      return "text-emerald-700";
    case "good":
      // blue-600 は白地に 5.2:1 で足りている。
      return "text-blue-600";
    case "caution":
      // 以前は yellow-500。白地に対して 1.9:1 しか無く、10px の数字が
      // 読めなかった。yellow-700 で 4.9:1（AA）。
      return "text-yellow-700";
    default:
      // 以前は red-500（白地に 3.8:1）。red-600 で 4.9:1。
      return "text-red-600";
  }
}

/**
 * 升目の塗り。**地色は必ずスコアの段階を表す。**
 *
 * 総合スコアの升目は、トリプル大吉なら緑、位相差警告なら橙で塗って
 * いた。どちらも凡例が別の意味に割り当てている色（緑＝大吉 ≥ 80、
 * 橙＝警告 ≥ 30）で、**点が 8 の升目が「警告」の橙に、点が 27 の升目
 * も同じ橙**になっていた。凡例を読んで色から点を読もうとすると必ず
 * 外れる。#147 で県塗りを直したのと同じ取り違え。
 *
 * 地色は段階だけが決める。トリプル大吉・位相差警告は升目の中の
 * 🌟 / ⚠️ と、この枠線（ring）で示す。情報は落とさず、色の意味だけを
 * 1 つに戻す。
 *
 * 文字色は地色（*-50）に対して AA（4.5:1）を満たす -700 に揃えた。
 * 以前の -600 は emerald が 3.6:1、red が 4.4:1 で足りていなかった。
 */
const SCORE_CELL_BASE: Record<ScoreTier, string> = {
  excellent: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  good: "bg-blue-50 text-blue-700 border border-blue-200",
  caution: "bg-amber-50 text-amber-700 border border-amber-200",
  bad: "bg-red-50 text-red-700 border border-red-200",
};

export function scoreCellClass(
  score: number,
  marker?: { consensus?: boolean; divergence?: boolean },
): string {
  const base = SCORE_CELL_BASE[scoreTier(score)];
  // ring は場所を取らないので、表の升目がずれない（border を太くすると
  // 1 行だけ高さが変わる）。
  if (marker?.consensus) return `${base} ring-2 ring-inset ring-emerald-500`;
  if (marker?.divergence) return `${base} ring-2 ring-inset ring-amber-500`;
  return base;
}

/** 凡例に出す「≥ 80」などの表記。しきい値を凡例に直書きしないため。 */
export const SCORE_TIER_LEGEND: { label: string; bound: string }[] = [
  { label: "大吉", bound: `≥ ${SCORE_THRESHOLDS.excellent}` },
  { label: "吉", bound: `≥ ${SCORE_THRESHOLDS.good}` },
  { label: "警告", bound: `≥ ${SCORE_THRESHOLDS.caution}` },
  { label: "大凶", bound: "その他" },
];
