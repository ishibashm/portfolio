import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  AffiliateHtml,
  AffiliateLink,
  AffiliateOffers,
  AffiliatePageTop,
} from "@/components/ads/AffiliateLink";
import { AFFILIATE_OFFERS, isAffiliatePage } from "@/lib/affiliateOffers";
import { sponsorizeAnchors } from "@/lib/affiliateHtml";

describe("アフィリエイトの土台", () => {
  it("案件が空なら何も描かない", () => {
    expect(AFFILIATE_OFFERS).toEqual([]);
    expect(
      renderToStaticMarkup(createElement(AffiliateOffers, { offers: [] })),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(AffiliatePageTop, { pathname: "/blog/example" }),
      ),
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
