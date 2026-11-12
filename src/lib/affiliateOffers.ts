/**
 * アフィリエイト案件。
 *
 * 案件を足すときはここに 1 件足し、出し先は placements にパスで書く。
 * placements が空、または該当パスが無いときは何も出さない。
 * テーマ外（noindex）の記事には出さない。DB には置かない。
 */
import { isOffThemeBlogSlug } from "@/lib/offThemeBlog";

export interface AffiliateOfferPlacement {
  /** このパスだけで出す。末尾の / は見ない。 */
  path: string;
  /** 本文中、この見出しの直前（直前の節の終わり）に広告枠を置く。 */
  beforeHeading?: string;
}

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
  /** サイド欄向けのバナー HTML（ハコブは 300×250 の素材 008）。 */
  bannerHtml?: string;
  /** 狭い画面向けのバナー HTML（ハコブは 320×50 の素材 005）。 */
  compactBannerHtml?: string;
  /** 枠の下に置く短い注記。無いときは出さない（ハコブの対象地域など）。 */
  note?: string;
  /** 出し先。無い・空ならどの頁にも出さない。 */
  placements?: readonly AffiliateOfferPlacement[];
}

/** ハコブ テキスト素材 002。A8 管理画面の掲載用タグ（画素は www11）。 */
export const HAKOBU_TEXT_002_HTML = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI" rel="nofollow">【ハコブ引っ越しサービス】</a>
<img border="0" width="1" height="1" src="https://www11.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI" alt="">`;

/** ハコブ バナー素材 008（300×250）。デスクトップのサイド欄で使う。 */
export const HAKOBU_BANNER_008_HTML = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TTDZ5" rel="nofollow">
<img border="0" width="300" height="250" alt="" src="https://www28.a8.net/svt/bgt?aid=261105097776&wid=001&eno=01&mid=s00000020949005008000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www14.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TTDZ5" alt="">`;

/** ハコブ バナー素材 005（320×50）。狭い画面の本文途中で使う。 */
export const HAKOBU_BANNER_005_HTML = `<a href="https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TSQTT" rel="nofollow">
<img border="0" width="320" height="50" alt="" src="https://www27.a8.net/svt/bgt?aid=261105097776&wid=001&eno=01&mid=s00000020949005005000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www15.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TSQTT" alt="">`;

/** 素材 001（「最安値級」）は使わない。 */
export const HAKOBU_TEXT_001_MAT = "4BGDZD+CU0E7M+4HN6+TRVYQ";

export const AFFILIATE_AREA_LABEL =
  "首都圏（東京・千葉・埼玉・神奈川）の引っ越し向け";

/**
 * 楽天 テキスト素材 060「楽天市場」。誇張のない文言。バナーが無いときの控え。
 */
export const RAKUTEN_TEXT_060_HTML = `<a href="https://rpx.a8.net/svt/ejp?a8mat=4BGDZD+BTOYB6+2HOM+6B70I&rakuten=y&a8ejpredirect=http%3A%2F%2Fhb.afl.rakuten.co.jp%2Fhgc%2F0ea62065.34400275.0ea62066.204f04c0%2Fa26110578798_4BGDZD_BTOYB6_2HOM_6B70I%3Fpc%3Dhttp%253A%252F%252Fwww.rakuten.co.jp%252F%26m%3Dhttp%253A%252F%252Fm.rakuten.co.jp%252F" rel="nofollow">楽天市場</a>
<img border="0" width="1" height="1" src="https://www12.a8.net/0.gif?a8mat=4BGDZD+BTOYB6+2HOM+6B70I" alt="">`;

/**
 * 楽天 バナー素材 009（468×60）。ロゴと検索欄だけで、誇張した文言が無い。
 * 楽天側に 300×250 / 320×50 は無いので、サイドも狭い画面もこれを幅いっぱいに縮小して使う。
 * 管理画面の img は http だが、HTTPS の頁では混在になるため https にしている（取得できることを確認済み）。
 */
export const RAKUTEN_BANNER_009_HTML = `<a href="https://rpx.a8.net/svt/ejp?a8mat=4BGDZD+BTOYB6+2HOM+609HT&rakuten=y&a8ejpredirect=http%3A%2F%2Fhb.afl.rakuten.co.jp%2Fhgc%2F0ea62065.34400275.0ea62066.204f04c0%2Fa26110578798_4BGDZD_BTOYB6_2HOM_609HT%3Fpc%3Dhttp%253A%252F%252Fwww.rakuten.co.jp%252F%26m%3Dhttp%253A%252F%252Fm.rakuten.co.jp%252F" rel="nofollow">
<img src="https://hbb.afl.rakuten.co.jp/hsb/0eb4bbb3.93b2e556.0eb4bbaa.95151395/" border="0"></a>
<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BGDZD+BTOYB6+2HOM+609HT" alt="">`;

const HAKOBU_PREF_CODES = ["13", "11", "12", "14"] as const;

const RAKUTEN_PATHS = [
  "/blog/feng-shui-where-to-put-things-in-a-room",
  "/blog/feng-shui-looks-inside-the-home",
] as const;

/**
 * DMM FX（s00000008903001）は掲載しない。
 * 金運・財運・投資を主題にした頁が無く、気学・方位の解説へ金融商品の広告を置くと
 * 誤解を招きうる。ガイドラインは損失・リスク説明の不足や不適切な集客を禁じており、
 * AdSense 再審査（有用性の低いコンテンツ）にも逆行するため、出さない。
 */
export const AFFILIATE_OFFERS: readonly AffiliateOffer[] = [
  {
    id: "hakobu-moving",
    html: HAKOBU_TEXT_002_HTML,
    bannerHtml: HAKOBU_BANNER_008_HTML,
    compactBannerHtml: HAKOBU_BANNER_005_HTML,
    note: AFFILIATE_AREA_LABEL,
    placements: [
      {
        path: "/blog/shinjuku-2027-directions-and-rent",
        beforeHeading: "注記",
      },
      {
        path: "/blog/what-is-hidori-for-moving",
        beforeHeading: "注記",
      },
      ...HAKOBU_PREF_CODES.map((code) => ({
        path: `/houi/pref/${code}`,
      })),
    ],
  },
  {
    id: "rakuten-market",
    html: RAKUTEN_TEXT_060_HTML,
    bannerHtml: RAKUTEN_BANNER_009_HTML,
    compactBannerHtml: RAKUTEN_BANNER_009_HTML,
    placements: RAKUTEN_PATHS.map((path) => ({ path })),
  },
];

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isOffThemeBlogPath(pathname: string): boolean {
  const match = /^\/blog\/([^/]+)$/.exec(pathname);
  return match ? isOffThemeBlogSlug(match[1]) : false;
}

export function placementForPath(
  pathname: string,
  offer: AffiliateOffer = AFFILIATE_OFFERS[0],
): AffiliateOfferPlacement | undefined {
  const path = normalizePathname(pathname);
  if (isOffThemeBlogPath(path)) return undefined;
  return offer.placements?.find((placement) => placement.path === path);
}

export function offersForPath(
  pathname: string,
  offers: readonly AffiliateOffer[] = AFFILIATE_OFFERS,
): AffiliateOffer[] {
  return offers.filter((offer) =>
    Boolean(
      (offer.html ||
        offer.href ||
        offer.bannerHtml ||
        offer.compactBannerHtml) &&
      placementForPath(pathname, offer),
    ),
  );
}

export function hasAffiliateOffer(pathname: string): boolean {
  return offersForPath(pathname).length > 0;
}

/** 広告（AdSense 枠かアフィリエイト）を置く頁。空の案件では何も出さない。 */
export function isAffiliatePage(pathname: string): boolean {
  if (pathname === "/") return true;
  return ["/blog", "/houi", "/guide", "/calendar"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
