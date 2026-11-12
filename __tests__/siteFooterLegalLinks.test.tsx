import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter, SITE_FOOTER_LINKS } from "@/components/SiteFooter";

describe("全ページ共通フッターの案内リンク", () => {
  it("プライバシー・運営者情報・問い合わせ・編集方針を含む", () => {
    const hrefs = SITE_FOOTER_LINKS.map((l) => l.href);
    for (const href of [
      "/about",
      "/editorial",
      "/contact",
      "/privacy",
      "/terms",
      "/guide",
      "/owners",
      "/practitioners",
    ]) {
      expect(hrefs, href).toContain(href);
    }
  });

  it("描画したフッターからそれらの URL と llms.txt へ辿れる", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const hrefs = [...doc.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    for (const href of [
      "/about",
      "/editorial",
      "/contact",
      "/privacy",
      "/terms",
      "/llms.txt",
    ]) {
      expect(hrefs, href).toContain(href);
    }
    expect(doc.querySelector("footer")?.textContent).toMatch(/Cloud Palette/);
  });
});
