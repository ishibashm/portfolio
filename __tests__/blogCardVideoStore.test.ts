import { expect, it, vi } from "vitest";
const { findMany, findFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: { blogPost: { findMany, findFirst } },
}));
import { loadBlogPosts } from "@/lib/blogStore";
it("DB記事も実Markdownの動画を補完し、DB本文の埋め込みも残す", async () => {
  const base = {
    title: "DB題",
    excerpt: "概要",
    category: "その他",
    publishedAt: new Date("2026-10-17"),
    updatedAt: new Date("2026-10-17"),
    tags: "",
    published: true,
  };
  findMany.mockResolvedValue([
    {
      ...base,
      slug: "four-foundations-of-eastern-divination",
      content: "::youtube",
    },
    {
      ...base,
      slug: "db-only",
      content:
        '<iframe src="https://www.youtube-nocookie.com/embed/12345678901"></iframe>',
    },
    { ...base, slug: "no-video", content: "文章だけ" },
  ]);
  const posts = await loadBlogPosts();
  expect(posts.map((p) => p.youtubeId)).toEqual([
    "jO35XXluLpw",
    "12345678901",
    undefined,
  ]);
  expect(posts.every((p) => !("body" in p))).toBe(true);
});
