/**
 * 走査の件数まわり。API の metadata を、画面に出せる形に整える。
 *
 * 画面には「何件見つかって、そのうち何件を評価したのか」がどこにも
 * 出ていなかった。出ていたのは「物件リスト (N件中、表示範囲内)」だけで、
 * この N は取得した窓（上限 500 件）を並べ替えたあとの数。全国で走査
 * しても 500 と出るので、条件を緩めるべきかどうかが読めない。
 *
 * ここは**純粋な関数だけ**。metadata は any で入ってくる（画面側の
 * useState<any>）ので、受け口で数値かどうかを見る。
 */

/** metadata から読む値。欠けていても落とさない。 */
export type ScanCountsInput = {
  uniqueCount?: unknown;
  totalAnalyzed?: unknown;
  limit?: unknown;
  duplicatesHidden?: unknown;
  staleHidden?: unknown;
  maxSeenDays?: unknown;
};

export type ScanCounts = {
  /**
   * 条件に一致した物件数（名寄せ後）。**分からないときは null。**
   *
   * totalCount で代用しない。あれは生の行数で、同じ部屋の別の掲載も
   * 別々に数えている。代用すると、実際より多い数を「物件数」として
   * 出すことになる。出せないなら出さないほうがよい。
   */
  matched: number | null;
  /** そのうち実際に評価した件数。 */
  analyzed: number;
  /**
   * 評価が上限で打ち切られているか。
   *
   * 打ち切られていると、一覧の外にもっと良い物件が居る可能性がある。
   * 「全部見た上での順位」と読まれると困るので、画面はここを見て断る。
   */
  truncated: boolean;
  /** 名寄せでまとめた件数。0 なら画面に出さない。 */
  duplicatesHidden: number;
  /** 鮮度で除いた件数。0 なら画面に出さない。 */
  staleHidden: number;
  /** 鮮度の境目（日）。staleHidden の説明に使う。無ければ null。 */
  staleDays: number | null;
};

/** 有限の非負整数だけ通す。文字列や NaN は「無い」と同じ扱い。 */
function nonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function buildScanCounts(
  metadata: ScanCountsInput | null | undefined,
): ScanCounts {
  const matched = nonNegative(metadata?.uniqueCount);
  const analyzed = nonNegative(metadata?.totalAnalyzed) ?? 0;
  const limit = nonNegative(metadata?.limit);

  // 打ち切りの判定は「上限まで取れた」だけでは足りない。ちょうど上限と
  // 同じ件数しか無いときは、全部見たのに打ち切られたと出てしまう。
  // 一致件数が分かっていて、それが評価件数と同じなら打ち切りではない。
  const truncated =
    limit !== null &&
    limit > 0 &&
    analyzed >= limit &&
    (matched === null || matched > analyzed);

  return {
    matched,
    analyzed,
    truncated,
    duplicatesHidden: nonNegative(metadata?.duplicatesHidden) ?? 0,
    staleHidden: nonNegative(metadata?.staleHidden) ?? 0,
    staleDays: nonNegative(metadata?.maxSeenDays) || null,
  };
}
