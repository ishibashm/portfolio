import type { DayTier } from "@/utils/auspiciousDays";

/**
 * 時期ヒートマップの絞り込み。
 *
 * 段階（S〜X）は既に計算済みなので、ここでやるのは表示を絞ることだけ。
 * **判定にも段階の割り当てにも触らない。**
 *
 * 段階と暦注は軸が違う。
 *
 *   段階   その日その方位が動けるか（方位盤から決まる）
 *   暦注   天赦日・一粒万倍日（日そのものの吉。方位とは独立）
 *
 * 同じ選択肢に混ぜると「S かつ天赦日」が表現できないので、別々に持って
 * AND で重ねる。
 */

/**
 * ヒートマップの 1 マスが実際に何色で塗られているか。
 *
 * 天中殺の日は段階に関わらず BLOCKED_FILL で塗られる（画面がそうなっている）。
 * 絞り込みは「見えている色」を対象にしないと、選んだ色と残るマスが食い違う。
 */
export type DayCategory = DayTier | "BLOCKED";

export const DAY_CATEGORIES: readonly DayCategory[] = [
  "S",
  "A",
  "B",
  "C",
  "D",
  "X",
  "BLOCKED",
];

/** 絞り込みが読む最小限の形。ページ側の TimelineDay がこれを満たす。 */
export interface FilterableDay {
  blocked: boolean;
  tiers: Record<string, string>;
  tags: string[];
}

/** 方位が未選択のときは C（平）として扱う。ヒートマップの塗りと同じ既定。 */
const FALLBACK_TIER: DayTier = "C";

export function dayCategory(
  day: FilterableDay,
  direction: string | null,
): DayCategory {
  if (day.blocked) return "BLOCKED";
  const tier = direction ? day.tiers[direction] : FALLBACK_TIER;
  return (tier as DayTier) || FALLBACK_TIER;
}

/** 天赦日・一粒万倍日。ヒートマップで金色の枠が付く条件と同じ。 */
export function isLuckyDay(day: FilterableDay): boolean {
  return day.tags.includes("天赦日") || day.tags.includes("一粒万倍日");
}

/**
 * 絞り込みに残るか。
 *
 * categories が空のときは「全部外した」であって「全部出す」ではない。
 * 0 件になるのが正しい（画面はそのとき「該当なし」と出す）。
 */
export function matchesTimingFilter(
  day: FilterableDay,
  direction: string | null,
  categories: ReadonlySet<DayCategory>,
  luckyOnly: boolean,
): boolean {
  if (!categories.has(dayCategory(day, direction))) return false;
  if (luckyOnly && !isLuckyDay(day)) return false;
  return true;
}

/** 全選択（＝絞り込み前と同じ見た目）。 */
export function allCategories(): Set<DayCategory> {
  return new Set(DAY_CATEGORIES);
}

/** 全部選んでいて暦注も外しているか。絞り込み中かどうかの表示に使う。 */
export function isUnfiltered(
  categories: ReadonlySet<DayCategory>,
  luckyOnly: boolean,
): boolean {
  return !luckyOnly && categories.size === DAY_CATEGORIES.length;
}

/** 選択の切り替え。Set は作り直す（React が変化に気付けるように）。 */
export function toggleCategory(
  categories: ReadonlySet<DayCategory>,
  category: DayCategory,
): Set<DayCategory> {
  const next = new Set(categories);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}
