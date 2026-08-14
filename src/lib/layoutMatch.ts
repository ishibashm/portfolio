/**
 * 間取りの選択を、実際に突き合わせる文字列へ広げる。
 *
 * 画面の絞り込みは layout の**部分一致**で見ている（"2LDK".includes(選択値)）。
 * この規則のままだと `2LDK` を選んでも `2SLDK`（納戸つき）が落ちる。
 * 納戸があるだけで居室の数は同じなので、2LDK を探している人にとっては
 * 候補から外れる理由が無い。選択 1 つを「2LDK と 2SLDK」に広げる。
 *
 * S を足すのは **数字 + K / DK / LDK** の形のときだけ。
 *   2LDK  → 2LDK, 2SLDK
 *   1DK   → 1DK, 1SDK
 *   1R    → 1R          （ワンルームに納戸つきの表記は無い）
 *   2SLDK → 2SLDK       （既に S 付きなら広げない）
 *
 * **広げた側から狭い側へは寄せない。**`2SLDK` を選んだときに `2LDK` まで
 * 拾うと、「納戸あり」を指定したのに無い物件が混ざる。広げるのは
 * 「S 無しを選んだら S 付きも含める」の一方向だけ。
 *
 * ここに置いたのは、同じ規則を 2 か所が見るため。
 *   - 一覧の絞り込み（arbitrage/page.tsx の filteredData）
 *   - 県別の件数（/api/rentals/arbitrage/prefecture-counts へ送る値）
 * 片方だけ広げると、件数と一覧が食い違ってどちらが本当か分からなくなる。
 * 広げた結果をそのまま API へも送るので、API 側の一致規則は変えていない。
 */

/** 数字 + K / DK / LDK。S を差し込める形か。 */
const PLAIN_LAYOUT = /^(\d)(K|DK|LDK)$/;

/** 選択 1 つを、突き合わせる文字列の一覧にする。 */
export function expandLayoutSelection(selected: string): string[] {
  const value = selected.trim().toUpperCase();
  if (!value) return [];
  const m = value.match(PLAIN_LAYOUT);
  if (!m) return [value];
  return [value, `${m[1]}S${m[2]}`];
}

/** 選択の集合を、重複なく広げる。 */
export function expandLayoutSelections(selected: string[]): string[] {
  return [...new Set(selected.flatMap(expandLayoutSelection))];
}

/**
 * その物件の間取りが、選択のどれかに当てはまるか。
 *
 * 突き合わせは部分一致のまま。前方一致にすると「ワンルーム2LDK」の
 * ような表記を落とす。
 */
export function matchesLayoutSelection(
  layout: string | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const target = (layout || "").toUpperCase();
  return expandLayoutSelections(selected).some((token) =>
    target.includes(token),
  );
}
