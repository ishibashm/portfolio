import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  AffiliateHtml,
  AffiliateLink,
  AffiliateOffers,
  AffiliatePageTop,
  AffiliatePlacement,
} from "@/components/ads/AffiliateLink";
import {
  AFFILIATE_AREA_LABEL,
  AFFILIATE_OFFERS,
  HAKOBU_TEXT_001_MAT,
  HAKOBU_TEXT_002_HTML,
  RAKUTEN_BANNER_009_HTML,
  RAKUTEN_TEXT_060_HTML,
  hasAffiliateOffer,
  isAffiliatePage,
  offersForPath,
} from "@/lib/affiliateOffers";
import { areaAffiliateOffer } from "@/lib/areaAffiliate";
import { OFF_THEME_BLOG_SLUGS } from "@/lib/offThemeBlog";
import { sponsorizeAnchors } from "@/lib/affiliateHtml";

const SHINJUKU = "/blog/shinjuku-2027-directions-and-rent";
const HIDORI = "/blog/what-is-hidori-for-moving";
const PREF_PATHS = [
  "/houi/pref/13",
  "/houi/pref/11",
  "/houi/pref/12",
  "/houi/pref/14",
] as const;
const RAKUTEN_PATHS = [
  "/blog/feng-shui-where-to-put-things-in-a-room",
  "/blog/feng-shui-looks-inside-the-home",
] as const;
const FORBIDDEN_HAKOBU_TERMS = [
  "s00000020949005008000",
  "s00000020949005005000",
  "TTDZ5",
  "TSQTT",
  "ランキング",
  "二冠",
  "三冠",
  "コスパ最高",
  "最安値",
  "No.1",
  "1位",
] as const;

describe("アフィリエイトの土台", () => {
  it("空の案件リストは何も描かない", () => {
    expect(
      renderToStaticMarkup(createElement(AffiliateOffers, { offers: [] })),
    ).toBe("");
    expect(isAffiliatePage("/login")).toBe(false);
    expect(isAffiliatePage("/blog/example")).toBe(true);
  });

  it("リンクは PR と sponsored nofollow noopener、別タブ", () => {
    const html = renderToStaticMarkup(
      <AffiliateLink href="https://example.com/item">見本の案件</AffiliateLink>,
    );
    expect(html).toContain(">PR<");
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com/item"');
    expect(html).toContain("見本の案件");
  });

  it("ASP の HTML を差し込み、アンカーの rel を揃える", () => {
    const sponsored = sponsorizeAnchors(
      '<a href="https://asp.example/c" rel="nofollow" target="_self">商品</a>',
    );
    expect(sponsored).toContain('rel="sponsored nofollow noopener"');
    expect(sponsored).toContain('target="_blank"');
    expect(sponsored).not.toContain('target="_self"');
    const html = renderToStaticMarkup(
      createElement(AffiliateOffers, {
        offers: [
          {
            id: "sample",
            html: '<a href="https://asp.example/c">商品</a>',
          },
        ],
      }),
    );
    expect(html).toContain("本ページはプロモーションを含みます");
    expect(html).toContain(">PR<");
    expect(html).toContain('rel="sponsored nofollow noopener"');
  });

  it("href も html も無い案件は描かない", () => {
    expect(
      renderToStaticMarkup(
        createElement(AffiliateHtml, { html: "<p>説明</p>" }),
      ),
    ).toContain(">PR<");
    expect(
      renderToStaticMarkup(
        createElement(AffiliateOffers, { offers: [{ id: "empty" }] }),
      ),
    ).toBe("");
  });
});

describe("ハコブ引っ越しサービスの掲載先", () => {
  it("案件はハコブと楽天の2件で、ハコブはテキスト素材 002 のみを持ち誇張した文言や DMM FX は持たない", () => {
    expect(AFFILIATE_OFFERS.map((offer) => offer.id)).toEqual([
      "hakobu-moving",
      "rakuten-market",
    ]);
    const hakobu = AFFILIATE_OFFERS.find(
      (offer) => offer.id === "hakobu-moving",
    )!;
    expect(hakobu.bannerHtml).toBeUndefined();
    expect(hakobu.compactBannerHtml).toBeUndefined();
    const serialized = JSON.stringify(AFFILIATE_OFFERS);
    expect(serialized).toContain("4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(serialized).toContain("【ハコブ引っ越しサービス】");
    expect(serialized).not.toContain("4BGDZD+CU0E7M+4HN6+TTDZ5");
    expect(serialized).not.toContain("s00000020949005008000");
    expect(serialized).not.toContain("4BGDZD+CU0E7M+4HN6+TSQTT");
    expect(serialized).not.toContain("s00000020949005005000");
    expect(serialized).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(serialized).not.toContain("最安値");
    expect(HAKOBU_TEXT_002_HTML).toContain("4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(HAKOBU_TEXT_002_HTML).toContain("【ハコブ引っ越しサービス】");
    expect(serialized).toContain("4BGDZD+BTOYB6+2HOM+609HT");
    expect(serialized).toContain("4BGDZD+BTOYB6+2HOM+6B70I");
    expect(serialized).toContain("https://hbb.afl.rakuten.co.jp/hsb/");
    expect(serialized).not.toContain("http://hbb.afl.rakuten.co.jp/");
    expect(serialized).not.toContain("日本最大級");
    expect(serialized).not.toContain("断然お得");
    expect(serialized).not.toContain("激安");
    expect(serialized).not.toContain("s00000008903001");
    expect(serialized).not.toContain("4BGDZD+BUADWY");
    expect(RAKUTEN_BANNER_009_HTML).toContain("609HT");
    expect(RAKUTEN_TEXT_060_HTML).toContain("楽天市場");
  });

  it("第一波の記事と1都3県の県ページだけに出す", () => {
    for (const path of [SHINJUKU, HIDORI, ...PREF_PATHS]) {
      expect(hasAffiliateOffer(path)).toBe(true);
      expect(hasAffiliateOffer(`${path}/`)).toBe(true);
      expect(offersForPath(path)).toHaveLength(1);
      expect(offersForPath(path)[0]?.id).toBe("hakobu-moving");
    }
    expect(hasAffiliateOffer("/")).toBe(false);
    expect(hasAffiliateOffer("/blog")).toBe(false);
    expect(hasAffiliateOffer("/blog/example")).toBe(false);
    expect(hasAffiliateOffer("/blog/which-day-counts-as-moving-day")).toBe(
      false,
    );
    expect(hasAffiliateOffer("/houi")).toBe(false);
    expect(hasAffiliateOffer("/houi/pref/1")).toBe(false);
    expect(hasAffiliateOffer("/houi/pref/27")).toBe(false);
    expect(hasAffiliateOffer("/calendar")).toBe(false);
    expect(hasAffiliateOffer("/guide")).toBe(false);
    expect(hasAffiliateOffer("/login")).toBe(false);
  });

  it("楽天は部屋の配置に関する記事だけに出し、ハコブの頁とは重ねない", () => {
    const paths = AFFILIATE_OFFERS.flatMap(
      (offer) => offer.placements?.map((placement) => placement.path) ?? [],
    );
    expect(paths).toHaveLength(new Set(paths).size);
    for (const path of RAKUTEN_PATHS) {
      expect(hasAffiliateOffer(path)).toBe(true);
      expect(hasAffiliateOffer(`${path}/`)).toBe(true);
      expect(offersForPath(path)).toHaveLength(1);
      expect(offersForPath(path)[0]?.id).toBe("rakuten-market");
    }
    for (const path of [SHINJUKU, HIDORI, ...PREF_PATHS]) {
      expect(RAKUTEN_PATHS).not.toContain(path);
    }
  });

  it("テーマ外（noindex）の記事には出さない", () => {
    expect(OFF_THEME_BLOG_SLUGS.length).toBeGreaterThan(0);
    for (const slug of OFF_THEME_BLOG_SLUGS) {
      expect(hasAffiliateOffer(`/blog/${slug}`)).toBe(false);
    }
    const blocked = {
      id: "blocked",
      html: HAKOBU_TEXT_002_HTML,
      placements: [{ path: `/blog/${OFF_THEME_BLOG_SLUGS[0]}` }],
    };
    expect(
      offersForPath(`/blog/${OFF_THEME_BLOG_SLUGS[0]}`, [blocked]),
    ).toEqual([]);
  });

  it("頁先頭には開示文も広告リンクも出さない", () => {
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: SHINJUKU }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: "/houi/pref/13" }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: "/blog/example" }),
      ),
    ).toBe("");
  });

  it("サイド欄はテキスト素材 002 と「広告」ラベル、対象地域の注記だけを出す", () => {
    const offer = AFFILIATE_OFFERS.find((item) => item.id === "hakobu-moving")!;
    const html = renderToStaticMarkup(
      <AffiliatePlacement offer={offer} variant="sidebar" />,
    );
    expect(html).toContain("広告");
    expect(html).toContain('aria-label="スポンサー広告"');
    expect(html).toContain("w-full");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain("PR（広告）");
    expect(html).not.toContain("この記事には広告");
    expect(html).not.toContain("rounded-2xl");
    expect(html).not.toContain("border-slate-200");
    expect(html).not.toContain("bg-white/80");
    expect(html).toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain(
      "https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
    );
    expect(html).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(html).toContain("【ハコブ引っ越しサービス】");
    expect(html).toContain(
      "https://www11.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
    );
    expect(html).toContain('width="1"');
    expect(html).toContain('height="1"');
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("text-slate-500");
    expect(html).not.toContain("s00000020949005008000");
    expect(html).not.toContain("s00000020949005005000");
    expect(html).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(html).not.toContain("最安値");
  });

  it("狭い画面もテキスト素材 002 を出し、バナー素材は出さない", () => {
    const offer = AFFILIATE_OFFERS.find((item) => item.id === "hakobu-moving")!;
    const html = renderToStaticMarkup(
      <AffiliatePlacement
        offer={offer}
        variant="compact"
        className="lg:hidden"
      />,
    );
    expect(html).toContain("lg:hidden");
    expect(html).toContain("広告");
    expect(html).toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain(
      "https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
    );
    expect(html).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(html).toContain("【ハコブ引っ越しサービス】");
    expect(html).toContain(
      "https://www11.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
    );
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("s00000020949005005000");
    expect(html).not.toContain("s00000020949005008000");
    expect(html).not.toContain('width="300"');
    expect(html).not.toContain('width="320"');
    expect(
      renderToStaticMarkup(
        <AffiliatePlacement
          offer={offer}
          variant="sidebar"
          className="hidden lg:block"
        />,
      ),
    ).toContain("hidden lg:block");
  });

  it("/houi/pref/13・/houi/area/13104・新宿ブログ経路の双方の variant でテキスト素材 002 を出す", () => {
    const targetOffers = [
      offersForPath("/houi/pref/13")[0]!,
      areaAffiliateOffer("13104")!,
      offersForPath(SHINJUKU)[0]!,
    ];
    for (const offer of targetOffers) {
      expect(offer).toBeDefined();
      for (const variant of ["compact", "sidebar"] as const) {
        const html = renderToStaticMarkup(
          <AffiliatePlacement offer={offer} variant={variant} />,
        );
        expect(html).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
        expect(html).toContain("【ハコブ引っ越しサービス】");
      }
    }
  });

  it("ハコブの描画（compact・sidebar）および AFFILIATE_OFFERS のハコブ項目に禁止されたバナーIDや誇大語句を含まない", () => {
    const hakobu = AFFILIATE_OFFERS.find(
      (item) => item.id === "hakobu-moving",
    )!;
    const serializedHakobu = JSON.stringify(hakobu);
    const compactHtml = renderToStaticMarkup(
      <AffiliatePlacement offer={hakobu} variant="compact" />,
    );
    const sidebarHtml = renderToStaticMarkup(
      <AffiliatePlacement offer={hakobu} variant="sidebar" />,
    );
    for (const term of FORBIDDEN_HAKOBU_TERMS) {
      expect(serializedHakobu).not.toContain(term);
      expect(compactHtml).not.toContain(term);
      expect(sidebarHtml).not.toContain(term);
    }
  });
});

describe("楽天アフィリエイトの掲載", () => {
  it("サイド欄は素材 009 のバナーと「広告」ラベルだけで、対象地域の注記は出さない", () => {
    const offer = AFFILIATE_OFFERS.find(
      (item) => item.id === "rakuten-market",
    )!;
    const html = renderToStaticMarkup(
      <AffiliatePlacement offer={offer} variant="sidebar" />,
    );
    expect(html).toContain("広告");
    expect(html).toContain('aria-label="スポンサー広告"');
    expect(html).toContain("w-full");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain(
      "https://rpx.a8.net/svt/ejp?a8mat=4BGDZD+BTOYB6+2HOM+609HT",
    );
    expect(html).toContain(
      "https://hbb.afl.rakuten.co.jp/hsb/0eb4bbb3.93b2e556.0eb4bbaa.95151395/",
    );
    expect(html).toContain("www16.a8.net/0.gif");
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("楽天市場</a>");
    expect(html).not.toContain("4BGDZD+BTOYB6+2HOM+6B70I");
    expect(html).not.toContain("日本最大級");
    expect(html).not.toContain("http://hbb.afl.rakuten.co.jp/");
  });

  it("狭い画面も同じ 468×60 の素材 009 を出し、テキストは重ねない", () => {
    const offer = AFFILIATE_OFFERS.find(
      (item) => item.id === "rakuten-market",
    )!;
    const html = renderToStaticMarkup(
      <AffiliatePlacement
        offer={offer}
        variant="compact"
        className="lg:hidden"
      />,
    );
    expect(html).toContain("lg:hidden");
    expect(html).toContain("広告");
    expect(html).not.toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain(
      "https://rpx.a8.net/svt/ejp?a8mat=4BGDZD+BTOYB6+2HOM+609HT",
    );
    expect(html).not.toContain("楽天市場</a>");
  });
});
