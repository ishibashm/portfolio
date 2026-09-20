import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
} from "@/utils/directionGeo";
import { TIER_ORDER, type DayTier } from "@/utils/dayTier";
import { isAvoidTier } from "@/lib/partyTimeline";

/**
 * **街を方位で探す**ための並べ方（2026-09-20）。
 *
 * 賃貸の巡回は規約に従って止め、掲載は 10 月中旬に 0 件になる。物件検索
 * （/relocation/arbitrage）は「部屋を並べる」から「**その日に開いている
 * 方位の街を並べる**」へ移す（利用者の依頼「物件検索の掲載も閉じて、
 * 違う形に変えて」）。材料は e-Stat の方位別の統計（街ごとの家賃・
 * 空き家率）と、その日の方位ごとの段階（`dayKigakuClient`）。
 *
 * ここは**並べ方だけ**の葉。判定は `dayKigakuClient` が持ち、街の一覧は
 * `/api/housing-stats/by-direction` が持つ。「開いている」の境目は
 * 時期ツールと同じ（`isAvoidTier`：X・D・天中殺を避ける）。同じ日の
 * 同じ方位が、時期ツールでは開いていて街の一覧では閉じている、という
 * 食い違いを作らない。
 *
 * 暦エンジンを引かない。物件検索の頁は初回の読み込みに暦エンジンを
 * 乗せない決まり（`arbitrageBundleLeaf`）なので、ここも葉のまま。
 */

/** その日の方位 1 つぶんの判定。`DayKigakuCell` の読む枝だけ。 */
export interface DirectionVerdict {
  tier: string;
  blocked: boolean;
}

function asTier(tier: string): DayTier {
  return (TIER_ORDER as readonly string[]).includes(tier)
    ? (tier as DayTier)
    : "X";
}

/**
 * 良い順の番手。S が 0、X が 5。天中殺は段階に関わらず最後。判定が
 * 無い（生年月日か出発地が無くて判定できない）方位は X の後ろ・天中殺の
 * 前に置く。「判定できない」を「良い」に読ませない。
 */
export function directionRank(cell: DirectionVerdict | undefined): number {
  if (!cell) return TIER_ORDER.length;
  if (cell.blocked) return TIER_ORDER.length + 1;
  return TIER_ORDER.indexOf(asTier(cell.tier));
}

/** その方位に動けるか。時期ツールの「避けるべき」と同じ境目。 */
export function isOpenDirection(cell: DirectionVerdict | undefined): boolean {
  if (!cell) return false;
  return !isAvoidTier(asTier(cell.tier), cell.blocked);
}

/**
 * 方位ごとの並びを「その日に開いている順」にする。
 *
 * 段階の良い順、同じなら八方位の定義順（北から時計回り）。判定が無ければ
 * 八方位の順のまま返す（並べ替えない）。**中身は触らない。**
 */
export function orderDirections<T extends { direction: CompassDirection }>(
  items: readonly T[],
  verdicts?: Record<string, DirectionVerdict>,
): T[] {
  const compass = (d: CompassDirection) => COMPASS_DIRECTIONS.indexOf(d);
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (verdicts) {
      const ra = directionRank(verdicts[a.direction]);
      const rb = directionRank(verdicts[b.direction]);
      if (ra !== rb) return ra - rb;
    }
    return compass(a.direction) - compass(b.direction);
  });
  return sorted;
}

/**
 * 方位ごとの件数。`DirectionTierOverview` の `count`（それまでは物件数）に
 * 街の数を入れるためのもの。無い方位も 0 で返す（黙って消さない）。
 */
export function countByDirection(
  items: readonly { direction: CompassDirection; count: number }[],
): Record<CompassDirection, number> {
  const out = {} as Record<CompassDirection, number>;
  for (const d of COMPASS_DIRECTIONS) out[d] = 0;
  for (const it of items) out[it.direction] = it.count;
  return out;
}
