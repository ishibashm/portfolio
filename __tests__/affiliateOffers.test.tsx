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
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import {
  AFFILIATE_AREA_LABEL,
  AFFILIATE_OFFERS,
  HAKOBU_BANNER_008_HTML,
  HAKOBU_TEXT_001_MAT,
  HAKOBU_TEXT_002_HTML,
  disclosureText,
  hasAffiliateOffer,
  isAffiliatePage,
  offersForPath,
  placementForPath,
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
  it("案件はハコブ1件で、素材001（最安値級）は使わない", () => {
    expect(AFFILIATE_OFFERS).toHaveLength(1);
    expect(AFFILIATE_OFFERS[0]?.id).toBe("hakobu-moving");
    const serialized = JSON.stringify(AFFILIATE_OFFERS);
    expect(serialized).toContain("4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(serialized).toContain("www11.a8.net/0.gif");
    expect(serialized).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(serialized).not.toContain("最安値");
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
      placements: [
        {
          path: `/blog/${OFF_THEME_BLOG_SLUGS[0]}`,
          intro: "出してはいけない",
        },
      ],
    };
    expect(
      offersForPath(`/blog/${OFF_THEME_BLOG_SLUGS[0]}`, [blocked]),
    ).toEqual([]);
  });

  it("頁先頭は開示文だけで、広告リンクは置かない", () => {
    const article = renderToStaticMarkup(
      createElement(AffiliatePageTop, { pathname: SHINJUKU }),
    );
    expect(article).toContain(disclosureText(SHINJUKU));
    expect(article).toContain(
      "この記事には広告（アフィリエイト）が含まれます。",
    );
    expect(article).not.toContain("px.a8.net");
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: "/houi/pref/13" }),
      ),
    ).toContain("このページには広告（アフィリエイト）が含まれます。");
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: "/blog/example" }),
      ),
    ).toBe("");
  });

  it("広告枠は PR（広告）と対象地域を出し、rel を揃える", () => {
    const offer = AFFILIATE_OFFERS[0]!;
    const placement = placementForPath(SHINJUKU, offer)!;
    const html = renderToStaticMarkup(
      <AffiliatePlacement offer={offer} intro={placement.intro} />,
    );
    expect(html).toContain("PR（広告）");
    expect(html).toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain(placement.intro);
    expect(html).toContain(
      "https://px.a8.net/svt/ejp?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
    );
    expect(html).toContain("www11.a8.net/0.gif");
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("【ハコブ引っ越しサービス】");
    expect(html).not.toContain("最安値");
    expect(html).not.toContain(HAKOBU_TEXT_001_MAT);
    expect(html).not.toContain('width="300"');
    expect(html).not.toContain("s00000020949005008000");
  });

  it("県ページだけ 300×250 バナーを添える", () => {
    const offer = AFFILIATE_OFFERS[0]!;
    const pref = placementForPath("/houi/pref/13", offer)!;
    expect(pref.showBanner).toBe(true);
    const html = renderToStaticMarkup(
      <AffiliatePlacement
        offer={offer}
        intro={pref.intro}
        showBanner={pref.showBanner}
      />,
    );
    expect(html).toContain(AFFILIATE_AREA_LABEL);
    expect(html).toContain("s00000020949005008000");
    expect(html).toContain('width="300"');
    expect(html).toContain('height="250"');
    expect(HAKOBU_BANNER_008_HTML).toContain("www28.a8.net");
    expect(html).toContain("www14.a8.net/0.gif");
    expect(placementForPath(SHINJUKU, offer)?.showBanner).toBeFalsy();
  });

  it("記事本文では注記の直前に広告枠を差し込む", () => {
    const offer = AFFILIATE_OFFERS[0]!;
    const placement = placementForPath(HIDORI, offer)!;
    expect(placement.beforeHeading).toBe("注記");
    const html = renderToStaticMarkup(
      <BlogArticleBody
        body={
          "## 暦と生活の都合が合わないときは、どうするか\n\n本文。\n\n## 注記\n\n注記の本文。"
        }
        insertBeforeHeading={{
          heading: placement.beforeHeading!,
          content: <AffiliatePlacement offer={offer} intro={placement.intro} />,
        }}
      />,
    );
    const adAt = html.indexOf("PR（広告）");
    const noteAt = html.indexOf(">注記<");
    const earlierAt = html.indexOf(
      "暦と生活の都合が合わないときは、どうするか",
    );
    expect(adAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(adAt);
    expect(adAt).toBeGreaterThan(earlierAt);
    expect(html).toContain(AFFILIATE_AREA_LABEL);
  });
});
