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
  HAKOBU_BANNER_005_HTML,
  HAKOBU_BANNER_008_HTML,
  HAKOBU_TEXT_001_MAT,
  HAKOBU_TEXT_002_HTML,
  hasAffiliateOffer,
  isAffiliatePage,
  offersForPath,
} from "@/lib/affiliateOffers";
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
  it("案件はハコブ1件で、素材001は使わず、バナーは008と005を持つ", () => {
    expect(AFFILIATE_OFFERS).toHaveLength(1);
    expect(AFFILIATE_OFFERS[0]?.id).toBe("hakobu-moving");
    const serialized = JSON.stringify(AFFILIATE_OFFERS);
    expect(serialized).toContain("4BGDZD+CU0E7M+4HN6+TTDZ5");
    expect(serialized).toContain("s00000020949005008000");
    expect(serialized).toContain("4BGDZD+CU0E7M+4HN6+TSQTT");
    expect(serialized).toContain("s00000020949005005000");
    expect(serialized).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(serialized).not.toContain("最安値");
    expect(HAKOBU_BANNER_008_HTML).toContain('width="300"');
    expect(HAKOBU_BANNER_005_HTML).toContain('width="320"');
    expect(HAKOBU_TEXT_002_HTML).toContain("【ハコブ引っ越しサービス】");
  });

  it("第一波の記事と1都3県の県ページだけに出す", () => {
    for (const path of [SHINJUKU, HIDORI, ...PREF_PATHS]) {
      expect(hasAffiliateOffer(path)).toBe(true);
      expect(hasAffiliateOffer(`${path}/`)).toBe(true);
      expect(offersForPath(path)).toHaveLength(1);
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

  it("サイド欄は 300×250 バナー（008）と「広告」ラベル、対象地域の注記だけを出す", () => {
    const offer = AFFILIATE_OFFERS[0]!;
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
      "https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TTDZ5",
    );
    expect(html).toContain("www28.a8.net/svt/bgt");
    expect(html).toContain("s00000020949005008000");
    expect(html).toContain('width="300"');
    expect(html).toContain('height="250"');
    expect(html).toContain("www14.a8.net/0.gif");
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("text-slate-500");
    expect(html).not.toContain("【ハコブ引っ越しサービス】");
    expect(html).not.toContain("4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(html).not.toContain("s00000020949005005000");
    expect(html).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(html).not.toContain("最安値");
  });

  it("狭い画面は 320×50 バナー（005）を出し、008は出さない", () => {
    const offer = AFFILIATE_OFFERS[0]!;
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
      "https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TSQTT",
    );
    expect(html).toContain("www27.a8.net/svt/bgt");
    expect(html).toContain("s00000020949005005000");
    expect(html).toContain('width="320"');
    expect(html).toContain('height="50"');
    expect(html).toContain("www15.a8.net/0.gif");
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).not.toContain("s00000020949005008000");
    expect(html).not.toContain('width="300"');
    expect(html).not.toContain("【ハコブ引っ越しサービス】");
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
});
