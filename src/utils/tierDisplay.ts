import type { DayTier } from "@/utils/auspiciousDays";

/**
 * 段階（S〜X）の見せ方の唯一の情報源。
 *
 * 吉凶の「重さ」の定義は noiseSeverity.ts、日の「段階」の定義は
 * auspiciousDays.gradeVerdict が持つ。ここはその段階を画面でどう
 * 呼び・どう塗るかだけを持つ。
 *
 * 以前は地図（ArbitrageMapInner）・物件スキャナー（arbitrage/page）・
 * 時期分析（timing/page）がそれぞれ手元に色表を持っていて、同じ S でも
 * 画面ごとに色や言葉が違った。さらに物件ピンは「超大吉・吉・警告・通常」
 * という別の語彙で、扇形の「大吉方位・凶方位」とも、マトリクスの
 * 「S/A/B/C/D/X」とも突き合わせられなかった。評価は一つ、見せ方も一つ。
 */

/**
 * 段階の塗り色。地図の扇形・県塗り・カレンダー・ピンすべて共通。
 *
 * 発散型（diverging）にしてある。段階は S→X の順序尺度で、真ん中の
 * C（平）が中立点。「良いか悪いか」を色相で、「どのくらいか」を濃さで
 * 出す。吉は緑の濃淡、平は灰、凶は橙→赤。
 *
 * 以前は S(#10b981 緑) A(#14b8a6 青緑) B(#38bdf8 水色) と、吉の 3 段を
 * 別々の色相にしていた。順序が色相の違いに化けていて、どれが上か
 * 色から読めないうえ、S と A が近すぎた（実測 ΔE 5.4／色覚多様性下 5.0。
 * dataviz の検証で「通常の色覚でも見分けにくい」の下限 15 を下回る）。
 * 地図の扇形のように文字ラベルが無い塗りでは、二つを区別できない。
 *
 * 濃淡に組み替えて 15.1／12.2 に改善した（どちらも合格）。
 * 変えるときは必ず検証スクリプトに掛けること。
 */
export const TIER_FILL: Record<DayTier, string> = {
  S: "#047857",
  A: "#10b981",
  B: "#6ee7b7",
  C: "#a8a29e",
  D: "#fb923c",
  X: "#dc2626",
};

/** ピンの縁取りなど、塗りより一段濃い色。 */
export const TIER_BORDER: Record<DayTier, string> = {
  S: "#022c22",
  A: "#065f46",
  B: "#047857",
  C: "#57534e",
  D: "#7c2d12",
  X: "#7f1d1d",
};

/** 天中殺で塞がっている方位。段階に関係なくこの色に落とす。 */
export const BLOCKED_FILL = "#64748b";
export const BLOCKED_BORDER = "#1e293b";

/** 段階の短い呼び名。凡例・ピンラベル・一覧のバッジ共通。 */
export const TIER_JP: Record<DayTier, string> = {
  S: "三盤吉",
  A: "吉2盤",
  B: "吉1盤",
  C: "平",
  D: "軽い凶",
  X: "五大凶殺",
};

/** 段階バッジの配色（Tailwind クラス）。 */
export const TIER_BADGE_CLASS: Record<DayTier, string> = {
  S: "bg-emerald-200 border-emerald-500 text-emerald-900",
  A: "bg-emerald-100 border-emerald-400 text-emerald-800",
  B: "bg-emerald-50 border-emerald-300 text-emerald-700",
  C: "bg-stone-100 border-stone-300 text-stone-600",
  D: "bg-orange-50 border-orange-300 text-orange-700",
  X: "bg-rose-50 border-rose-300 text-rose-700",
};

/** 扇形の塗りの濃さ。良い段階ほど目立たせ、平は薄く敷く。 */
export const TIER_SECTOR_OPACITY: Record<DayTier, number> = {
  S: 0.18,
  A: 0.14,
  B: 0.1,
  C: 0.04,
  D: 0.08,
  X: 0.1,
};

export interface TierPinColors {
  fillColor: string;
  borderColor: string;
  textClass: string;
  bgClass: string;
  label: string;
}

/**
 * 段階の文字色。塗りと同じ順序（S が一番強い）で読めること。
 *
 * ダークは明るいほうが強く見えるので、ライトとは逆向きに並べる。
 * ライト  S 900 → A 800 → B 700（暗いほど強い）
 * ダーク  S 300 → A 400 → B 500（明るいほど強い）
 *
 * S と B に同じ `dark:text-emerald-300` を当てていて、ダークでは
 * 二つが完全に同色（ΔE 0）だった。しかも A だけ暗く、S→A→B の順序が
 * 崩れていた。物件のポップアップの見出しがこの色で出る。
 *
 * ライト側は 800/600/500 だったが、A と B が WCAG AA（本文 4.5:1）に
 * 届いていなかった。地色 #f7f4f0 に対する実測。
 *
 *   emerald-500  2.25:1    emerald-800  6.91:1
 *   emerald-600  3.34:1    emerald-900  8.83:1
 *   emerald-700  4.90:1
 *
 * B だけ 700 に落とすと A（600）より暗くなって順序が壊れるので、
 * 3 段まとめて 900/800/700 に下げてある。AA を満たす一番明るい段が
 * 700 で、そこから 1 段ずつ。
 */
const TIER_TEXT_CLASS: Record<DayTier, string> = {
  S: "text-emerald-900 dark:text-emerald-300",
  A: "text-emerald-800 dark:text-emerald-400",
  B: "text-emerald-700 dark:text-emerald-500",
  C: "text-stone-500 dark:text-stone-400",
  D: "text-orange-600 dark:text-orange-400",
  X: "text-red-500 dark:text-red-400",
};

/**
 * 段階の帯（背景と枠）。文字色と同じ順序で読めること。
 *
 * ライトは色の濃さで強弱を出している（S が一番濃い緑）。この見え方は
 * そのまま。
 *
 * ダークではこれが反転する。不透明度で薄めているので、暗い地の上では
 * 「明るい色ほど濃く見える」——S の bg-emerald-700/15（暗い緑 15%）が
 * 一番目立たず、B の bg-emerald-300/15（明るい緑 15%）が一番目立つ。
 * 一番強い段階の帯が一番薄い、という逆の見え方になっていた。
 *
 * ダークだけ色相を 1 つ（emerald-400）に固定して、不透明度の差で
 * 強弱を出す。25 → 15 → 8 で S → A → B。
 */
const TIER_BG_CLASS: Record<DayTier, string> = {
  S: "bg-emerald-700/15 border-emerald-700/40 dark:bg-emerald-400/25 dark:border-emerald-400/55",
  A: "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-400/15 dark:border-emerald-400/40",
  B: "bg-emerald-300/15 border-emerald-400/30 dark:bg-emerald-400/8 dark:border-emerald-400/25",
  C: "bg-stone-500/10 border-stone-500/30",
  D: "bg-orange-500/10 border-orange-500/30",
  X: "bg-red-500/10 border-red-500/30",
};

/**
 * 段階からピン・バッジの色一式を引く。
 * 天中殺で塞がっている方位は段階に関わらず灰色。
 */
export function tierPinColors(
  tier: string,
  blocked?: boolean,
): TierPinColors | null {
  if (blocked) {
    return {
      fillColor: BLOCKED_FILL,
      borderColor: BLOCKED_BORDER,
      textClass: "text-slate-500 dark:text-slate-400",
      bgClass: "bg-slate-500/10 border-slate-500/30",
      label: "天中殺",
    };
  }
  const t = tier as DayTier;
  if (!TIER_FILL[t]) return null;
  return {
    fillColor: TIER_FILL[t],
    borderColor: TIER_BORDER[t],
    textClass: TIER_TEXT_CLASS[t],
    bgClass: TIER_BG_CLASS[t],
    label: TIER_JP[t],
  };
}
