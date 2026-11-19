import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

  // 2026-11-19: テーマ外 21 本は下書き（draft: true）に戻し、頁は 404 にした。
  // 原稿ファイルは残すが getBlogPost では返らない。
  const DRAFTED = new Set(OFF_THEME_BLOG_SLUGS);

  it("原稿ファイルは残し、下書きにした記事は getBlogPost では返らない", () => {
    expect(DRAFTED.size).toBe(21);
    for (const slug of OFF_THEME_BLOG_SLUGS) {
      expect(existsSync(join("content", "blog", `${slug}.md`)), slug).toBe(
        true,
      );
      expect(getBlogPost(slug), slug).toBeUndefined();
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
