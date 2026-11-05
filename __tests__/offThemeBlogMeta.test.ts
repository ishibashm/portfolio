import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBlogPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/blogStore", () => ({ loadBlogPost }));

import { generateMetadata } from "@/app/blog/[slug]/page";

beforeEach(() => {
  loadBlogPost.mockImplementation(async (slug: string) => ({
    slug,
    title: "題",
    description: "説明",
    publishedAt: "2026-01-01",
    category: "その他",
    tags: ["a"],
    draft: false,
    readingMinutes: 1,
    body: "本文",
  }));
});

describe("テーマ外の頁は noindex", () => {
  it("robots を noindex にし、テーマ内には robots を書かない", async () => {
    const off = await generateMetadata({
      params: Promise.resolve({ slug: "money-and-time-units" }),
    });
    expect(off.robots).toMatchObject({ index: false, follow: true });
    const on = await generateMetadata({
      params: Promise.resolve({ slug: "can-you-recover-from-honmei-teki" }),
    });
    expect(on.robots).toBeUndefined();
  });
});
