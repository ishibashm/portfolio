/**
 * AdSense のパブリッシャー ID の扱い。
 *
 * 未設定・見本値のまま広告タグや ads.txt を出すと、審査や配信で不利になる。
 * 「設定されているか」ではなく「実在しうる形か」で判定する。
 */

/** AdSense のパブリッシャー ID は "pub-" + 16 桁。ゼロ埋めの見本は弾く。 */
export function isValidAdsensePublisherId(
  id: string | undefined | null,
): id is string {
  if (!id) return false;
  if (!/^pub-\d{16}$/.test(id)) return false;
  return !/^pub-0+$/.test(id);
}

/** 設定済みで有効なときだけ ID を返す。そうでなければ null。 */
export function getAdsensePublisherId(): string | null {
  const id = process.env.NEXT_PUBLIC_ADSENSE_ID;
  return isValidAdsensePublisherId(id) ? id : null;
}
