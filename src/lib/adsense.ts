/**
 * AdSense のパブリッシャー ID の扱い。
 *
 * AdSense は同じ ID を 2 つの表記で使い分ける。片方だけ揃えても動かない。
 *
 *   ads.txt                       pub-0000000000000000
 *   スクリプトの client=          ca-pub-0000000000000000
 *   <ins> の data-ad-client       ca-pub-0000000000000000
 *   <meta google-adsense-account> ca-pub-0000000000000000
 *
 * 以前は環境変数の値をそのまま全部に流していたため、どちらの形で設定しても
 * 必ず片方が壊れる状態だった。ここで両方の表記を作る。
 *
 * 環境変数 NEXT_PUBLIC_ADSENSE_ID は `pub-` でも `ca-pub-` でも受け付ける。
 * 未設定・見本値（ゼロ埋め）のときは null を返し、呼び出し側は
 * 広告タグも ads.txt も出さない。空の広告枠を審査中に見せないため。
 */

export interface AdsenseIds {
  /** ads.txt に書く形。 */
  adsTxt: string;
  /** スクリプトと data-ad-client に書く形。 */
  client: string;
}

const PUBLISHER_ID = /^(?:ca-)?pub-(\d{16})$/;

/** 実在しうる形か。ゼロ埋めの見本は弾く。 */
export function isValidAdsensePublisherId(
  id: string | undefined | null,
): id is string {
  if (!id) return false;
  const m = PUBLISHER_ID.exec(id.trim());
  if (!m) return false;
  return !/^0+$/.test(m[1]);
}

/** `pub-` / `ca-pub-` のどちらで渡されても、両方の表記を作る。 */
export function normalizeAdsenseId(
  id: string | undefined | null,
): AdsenseIds | null {
  if (!isValidAdsensePublisherId(id)) return null;
  const digits = PUBLISHER_ID.exec(id.trim())![1];
  return { adsTxt: `pub-${digits}`, client: `ca-pub-${digits}` };
}

/** 設定済みで有効なときだけ ID を返す。 */
export function getAdsenseIds(): AdsenseIds | null {
  return normalizeAdsenseId(process.env.NEXT_PUBLIC_ADSENSE_ID);
}

/**
 * 個別の広告ユニット（スロット）ID。
 *
 * 自動広告だけで運用するならスロットは要らない。その場合ここは空のままで、
 * AdBanner は何も描かない（空の枠を出すより、出さないほうがよい）。
 */
export function getAdsenseSlot(name: "article" | "list"): string | null {
  const slot =
    name === "article"
      ? process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE
      : process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIST;
  if (!slot) return null;
  return /^\d{6,}$/.test(slot.trim()) ? slot.trim() : null;
}
