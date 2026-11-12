import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import nextConfig from "../next.config";
import { BlogIndex } from "@/components/blog/BlogIndex";
import { metadata as notFoundMetadata } from "@/app/not-found";
import AboutPage from "@/app/about/page";
import { YouTubeFacade } from "@/components/blog/YouTubeFacade";
import { SITE_SAME_AS, YOUTUBE_CHANNELS } from "@/lib/siteChannels";
import { houiContentYears } from "@/lib/houiCanonicalPath";
import { createElement } from "react";

describe("公開 URL を変えずに一覧を静的にする", () => {
  it("searchParams を読まず、新着順は rewrite で別ルートへ振る", async () => {
    const page = readFileSync("src/app/blog/page.tsx", "utf8");
    const datePage = readFileSync("src/app/blog/sort/date/page.tsx", "utf8");
    expect(page).not.toMatch(/\{\s*searchParams/);
    expect(page).toContain("revalidate = 60");
    expect(datePage).toContain("revalidate = 60");
    expect(datePage).not.toMatch(/\{\s*searchParams/);
    const rewrites = await nextConfig.rewrites?.();
    const beforeFiles =
      rewrites && !Array.isArray(rewrites) ? (rewrites.beforeFiles ?? []) : [];
    expect(beforeFiles).toContainEqual({
      source: "/blog",
      has: [{ type: "query", key: "sort", value: "date" }],
      destination: "/blog/sort/date",
    });
  });

  it("新着順の HTML は ?sort=date を指し、正典は /blog", () => {
    const html = renderToStaticMarkup(
      createElement(BlogIndex, {
        sort: "date",
        posts: [
          {
            slug: "newer",
            title: "新しい",
            description: "説明",
            publishedAt: "2026-08-02",
            category: "方位",
            tags: [],
            draft: false,
            readingMinutes: 2,
          },
          {
            slug: "older",
            title: "古い",
            description: "説明",
            publishedAt: "2026-08-01",
            category: "方位",
            tags: [],
            draft: false,
            readingMinutes: 2,
          },
        ],
      }),
    );
    expect(html).toContain('href="/blog?sort=date"');
    expect(html).toContain('aria-current="page"');
    expect(html.indexOf("新しい")).toBeLessThan(html.indexOf("古い"));
    const dateMeta = readFileSync("src/app/blog/sort/date/page.tsx", "utf8");
    expect(dateMeta).toContain("blogIndexMetadata");
  });
});

describe("正規でない方位パスは頁でも 404", () => {
  it("年別の先頭ゼロは notFound", async () => {
    const YearPage = (await import("@/app/houi/[year]/[star]/page")).default;
    const year = String(houiContentYears()[0]);
    await expect(
      YearPage({ params: Promise.resolve({ year, star: "01" }) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("月別の先頭ゼロは notFound", async () => {
    const MonthPage = (await import("@/app/houi/[year]/[star]/[month]/page"))
      .default;
    const year = String(houiContentYears()[0]);
    await expect(
      MonthPage({
        params: Promise.resolve({ year, star: "1", month: "01" }),
      }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("404 は noindex だけで canonical を持たない", () => {
  it("metadata", () => {
    expect(notFoundMetadata.robots).toMatchObject({
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    });
    expect(notFoundMetadata.alternates).toEqual({ canonical: null });
  });
});

describe("YouTube の導線", () => {
  it("sameAs の 3 チャンネルを /about に出す", () => {
    expect(SITE_SAME_AS.slice(0, 3)).toEqual(
      YOUTUBE_CHANNELS.map((channel) => channel.url),
    );
    const html = renderToStaticMarkup(createElement(AboutPage));
    for (const channel of YOUTUBE_CHANNELS) {
      expect(html).toContain(`href="${channel.url}"`);
      expect(html).toContain(channel.name);
    }
    expect(html).toContain("本ページはプロモーションを含みます");
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toContain("アフィリエイトプログラム");
    expect(privacy).toContain("本ページはプロモーションを含みます");
  });

  it("動画の下に方位と住まいの手帖と登録リンクを出す", () => {
    const html = renderToStaticMarkup(
      createElement(YouTubeFacade, {
        youtubeId: "Abc_123-xyz",
        title: "題",
        cover: "/blog/x.png",
      }),
    );
    expect(html).toContain("方位と住まいの手帖で他の動画を見る");
    expect(html).toContain('href="https://www.youtube.com/@houi-sumai-techo"');
    expect(html).toContain(
      'href="https://www.youtube.com/@houi-sumai-techo?sub_confirmation=1"',
    );
    expect(html).toContain("チャンネル登録");
  });
});
