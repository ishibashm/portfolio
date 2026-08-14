/**
 * 家賃分布ヒストグラムの升目の定義と整形。
 *
 * 「家賃上限をいくつにすれば何件残るか」が入力前に見えないという
 * 課題への答え。分布は総家賃（賃料＋管理費）で数える。絞り込みも
 * 総家賃で比べている（rentalCountFilters）ので、分布と絞り込みの
 * 物差しを揃える。賃料だけで数えると、管理費の高い物件が 1 つ左の
 * 升に入って、上限を決めたのに件数が合わない。
 *
 * 升は 1 万円刻みで 0〜30 万円、その上は 1 つの升にまとめる。
 * 賃貸の総家賃は上に長い裾を持つので、等分だと右半分がほぼ空になる。
 */

/** 升の幅（円）。 */
export const BUCKET_YEN = 10_000;
/** この額以上は最後の升にまとめる（円）。 */
export const OVERFLOW_FLOOR_YEN = 300_000;
/** 升の数（0〜30 万の 30 個 ＋ あふれ 1 個）。 */
export const BUCKET_COUNT = OVERFLOW_FLOOR_YEN / BUCKET_YEN + 1;

export type RentBucket = {
  /** 升の下端（円）。あふれ升は OVERFLOW_FLOOR_YEN。 */
  fromYen: number;
  /** 升の上端（円・この値を含まない）。あふれ升は null。 */
  toYen: number | null;
  count: number;
};

/**
 * SQL の width_bucket の結果（升番号 → 件数）を、画面が読める形に開く。
 *
 * width_bucket(x, 0, 30万, 30) は 0 未満に 0、30 万以上に 31 を返す。
 * 家賃に負の値は無いので 0 番は捨てる。**件数 0 の升も出す。**升が
 * 抜けると棒の位置が詰まり、横軸が金額として読めなくなる。
 */
export function shapeRentHistogram(
  rows: Array<{ bucket: number; n: number }>,
): RentBucket[] {
  const byBucket = new Map<number, number>();
  for (const row of rows) {
    const bucket = Number(row.bucket);
    if (!Number.isInteger(bucket) || bucket < 1 || bucket > BUCKET_COUNT) {
      continue;
    }
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + Number(row.n));
  }

  return Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const bucket = i + 1;
    const overflow = bucket === BUCKET_COUNT;
    return {
      fromYen: (bucket - 1) * BUCKET_YEN,
      toYen: overflow ? null : bucket * BUCKET_YEN,
      count: byBucket.get(bucket) ?? 0,
    };
  });
}
