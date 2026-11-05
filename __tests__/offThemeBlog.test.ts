import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { OFF_THEME_BLOG_SLUGS, isOffThemeBlogSlug } from "@/lib/offThemeBlog";
import { getBlogPost, getBlogPosts } from "@/lib/blog";

const require_ = createRequire(import.meta.url);

describe("テーマ外の記事", () => {
  it("指定した slug をコード側の一覧で持つ", () => {
    expect(OFF_THEME_BLOG_SLUGS).toContain("action-speed-and-completion-time");
    expect(OFF_THEME_BLOG_SLUGS).toContain(
      "prediction-journal-before-and-after",
    );
    expect(isOffThemeBlogSlug("can-you-recover-from-honmei-teki")).toBe(false);
    expect(new Set(OFF_THEME_BLOG_SLUGS).size).toBe(
      OFF_THEME_BLOG_SLUGS.length,
    );
  });

  it("原稿は残っている（頁は 200 のままにする）", () => {
    for (const slug of OFF_THEME_BLOG_SLUGS) {
      expect(getBlogPost(slug)?.slug, slug).toBe(slug);
    }
  });

  it("サイトマップの除外と lastmod から外す", () => {
    const config = require_("../next-sitemap.config.js");
    const exclude: string[] = config.exclude;
    for (const slug of OFF_THEME_BLOG_SLUGS) {
      expect(exclude, slug).toContain(`/blog/${slug}`);
      expect(config.blogLastmod[`/blog/${slug}`], slug).toBeUndefined();
    }
    expect(exclude).toContain("/blog/sort/date");
    const indexed = getBlogPosts().filter(
      (post) => !isOffThemeBlogSlug(post.slug),
    );
    expect(config.blogLastmod["/blog"]).toBe(
      indexed
        .map((post) => post.updatedAt ?? post.publishedAt)
        .sort()
        .at(-1),
    );
  });
});
