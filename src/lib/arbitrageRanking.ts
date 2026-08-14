import type { DayTier } from "@/utils/auspiciousDays";

/**
 * 一覧の並び順の規則。「吉凶の段階 → 家賃の安い順」。
 *
 * 以前は総合スコア（11 軸の加重平均）の高い順だった。評価軸と重みは
 * 利用者の指示で廃止したので、並びの一義は方位の吉凶に戻る。方位で
 * 探す画面なので、同じ段階の中では家賃の安い順が素直。
 *
 * ここは**判定を作らない**。段階（S〜X）と天中殺は dayKigaku が出した
 * ものを受け取り、順位に写すだけ。判定の答えはこの変更で変わらない。
 */

/**
 * 段階 → 並び順の重み。小さいほど上に出す。
 *
 * 判定が無い（出発地・生年月日が未入力、方位が引けない）ものは
 * 「平の下・凶の上」に置く。凶ではないが勧めもできない、の位置。
 * 上に混ぜると無判定が吉に見え、凶の下に置くと「D より悪い」ことに
 * なってしまう。
 */
const TIER_ORDER: Record<DayTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 5,
  X: 6,
};

export const UNKNOWN_KIGAKU_RANK = 4;

/**
 * 吉凶の並び順の重み。
 *
 * 天中殺で塞がっている方位は段階に関わらず X と同じ扱い。地図の扇形・
 * 県塗りが「段階に関わらず灰色」にしているのと同じ判断で、色と順位の
 * 物差しを揃える。
 */
export function kigakuRank(
  kigaku: { tier?: string | null; blocked?: boolean } | null | undefined,
): number {
  if (!kigaku) return UNKNOWN_KIGAKU_RANK;
  if (kigaku.blocked) return TIER_ORDER.X;
  const tier = kigaku.tier as DayTier | null | undefined;
  return tier != null && tier in TIER_ORDER
    ? TIER_ORDER[tier]
    : UNKNOWN_KIGAKU_RANK;
}

/**
 * 「吉凶の段階 → 家賃の安い順」の比較。Array.prototype.sort 用。
 *
 * 家賃が取れていない行は同じ段階の最後に置く。0 円として先頭に
 * 出すと、家賃未取得の行が常に「最安」を名乗ることになる。
 */
export function compareKigakuThenRent(
  a: { kigakuRank: number; totalRent: number | null | undefined },
  b: { kigakuRank: number; totalRent: number | null | undefined },
): number {
  if (a.kigakuRank !== b.kigakuRank) return a.kigakuRank - b.kigakuRank;
  const aRent =
    typeof a.totalRent === "number" && Number.isFinite(a.totalRent)
      ? a.totalRent
      : Infinity;
  const bRent =
    typeof b.totalRent === "number" && Number.isFinite(b.totalRent)
      ? b.totalRent
      : Infinity;
  return aRent - bRent;
}
