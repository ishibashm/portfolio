import { describe, expect, it } from "vitest";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL, pageOpenGraph } from "@/lib/siteUrl";

describe("pageOpenGraph", () => {
  it("og:url は canonical と同じ絶対 URL で、site_name と locale を埋める", () => {
    const og = pageOpenGraph("/houi/pref/13", "東京都の家賃相場", "説明");
    expect(og).toMatchObject({
      title: `東京都の家賃相場 | ${SITE_NAME}`,
      description: "説明",
      url: `${SITE_URL}/houi/pref/13`,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "website",
    });
    expect(og && "images" in og).toBe(true);
  });

  it("omitImages のとき images を出さない（opengraph-image に任せる）", () => {
    const og = pageOpenGraph("/blog/example", "題", "説明", {
      type: "article",
      omitImages: true,
      publishedTime: "2026-01-02",
      tags: ["方位"],
    });
    expect(og).toMatchObject({
      url: `${SITE_URL}/blog/example`,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "article",
      publishedTime: "2026-01-02",
      tags: ["方位"],
    });
    expect(og && "images" in og).toBe(false);
  });

  it("題にサイト名が付いていれば重ねない", () => {
    const og = pageOpenGraph("/x", `題 | ${SITE_NAME}`, "説明");
    expect(og?.title).toBe(`題 | ${SITE_NAME}`);
  });
});
