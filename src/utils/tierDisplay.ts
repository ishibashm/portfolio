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

/** 段階の塗り色。地図の扇形・県塗り・カレンダー・ピンすべて共通。 */
export const TIER_FILL: Record<DayTier, string> = {
  S: "#10b981",
  A: "#14b8a6",
  B: "#38bdf8",
  C: "#a8a29e",
  D: "#f59e0b",
  X: "#ef4444",
};

/** ピンの縁取りなど、塗りより一段濃い色。 */
export const TIER_BORDER: Record<DayTier, string> = {
  S: "#065f46",
  A: "#0f766e",
  B: "#0369a1",
  C: "#57534e",
  D: "#78350f",
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
  S: "bg-emerald-100 border-emerald-300 text-emerald-800",
  A: "bg-teal-50 border-teal-300 text-teal-700",
  B: "bg-sky-50 border-sky-300 text-sky-700",
  C: "bg-stone-100 border-stone-300 text-stone-600",
  D: "bg-amber-50 border-amber-300 text-amber-700",
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

const TIER_TEXT_CLASS: Record<DayTier, string> = {
  S: "text-emerald-500 dark:text-emerald-400",
  A: "text-teal-600 dark:text-teal-400",
  B: "text-sky-600 dark:text-sky-400",
  C: "text-stone-500 dark:text-stone-400",
  D: "text-amber-600 dark:text-amber-500",
  X: "text-red-500 dark:text-red-400",
};

const TIER_BG_CLASS: Record<DayTier, string> = {
  S: "bg-emerald-500/10 border-emerald-500/30",
  A: "bg-teal-500/10 border-teal-500/30",
  B: "bg-sky-500/10 border-sky-500/30",
  C: "bg-stone-500/10 border-stone-500/30",
  D: "bg-amber-500/5 border-amber-500/20",
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
