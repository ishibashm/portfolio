/**
 * アフィリエイト案件。
 *
 * 実リンクはまだ置かない。空のままなら、広告コンポーネントは何も描かない。
 * 案件を足すときはここに 1 件足す。DB には置かない（表を足さない）。
 */
export interface AffiliateOffer {
  id: string;
  /** リンクの文言。html が無いときに使う。 */
  label?: string;
  /** リンク先。html が無いときに使う。 */
  href?: string;
  /**
   * ASP が渡す HTML。あるときは href ではなくこちらを差し込む。
   * アンカーには rel="sponsored nofollow noopener" と target="_blank" を付ける。
   */
  html?: string;
}

export const AFFILIATE_OFFERS: readonly AffiliateOffer[] = [];

/** 広告（AdSense 枠かアフィリエイト）を置く頁。空の案件では何も出さない。 */
export function isAffiliatePage(pathname: string): boolean {
  if (pathname === "/") return true;
  return ["/blog", "/houi", "/guide", "/calendar"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
