import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 記事の取得口（DB 先・Markdown 後）。
 *
 * 守るのは 3 つ。
 *   1. DB に行があればそちらを出す
 *   2. **DB が空なら Markdown を出す。**取り込みを流す前にコードが本番へ
 *      出ても /blog を空にしないため
 *   3. **DB が読めなくても Markdown を出す。**記事は公開ページなので、
 *      DB の不調で 500 にする理由が無い。ビルド時の事前生成も同じ経路を
 *      通るので、ビルドが DB の生死に依存しなくなる
 */

const { findMany, findFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { blogPost: { findMany, findFirst } },
}));

vi.mock("@/lib/blog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/blog")>("@/lib/blog");
  return {
    ...actual,
    getBlogPosts: () => [
      {
        slug: "from-markdown",
        title: "ファイルの記事",
        description: "md",
        publishedAt: "2026-08-01",
        updatedAt: undefined,
        category: "引越しの考え方",
        tags: ["a"],
        draft: false,
        readingMinutes: 3,
      },
    ],
    getBlogPost: (slug: string) =>
      slug === "from-markdown"
        ? {
            slug: "from-markdown",
            title: "ファイルの記事",
            description: "md",
            publishedAt: "2026-08-01",
            updatedAt: undefined,
            category: "引越しの考え方",
            tags: ["a"],
            draft: false,
            readingMinutes: 3,
            body: "ファイルの本文",
          }
        : undefined,
  };
});

import { loadBlogPost, loadBlogPosts } from "@/lib/blogStore";

const dbRow = {
  slug: "from-db",
  title: "DB の記事",
  content: "DB の本文",
  excerpt: "db",
  category: "引越しの考え方",
  publishedAt: new Date("2026-08-10T00:00:00+09:00"),
  updatedAt: new Date("2026-08-10T00:00:00+09:00"),
  tags: "x, y",
  published: true,
};

describe("loadBlogPosts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DB に行があればそちらを出す", async () => {
    findMany.mockResolvedValue([dbRow]);
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-db"]);
    expect(posts[0].tags).toEqual(["x", "y"]);
    expect(posts[0].publishedAt).toBe("2026-08-10");
  });

  it("DB が空なら Markdown を出す", async () => {
    findMany.mockResolvedValue([]);
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-markdown"]);
  });

  it("DB が読めなくても Markdown を出す", async () => {
    findMany.mockRejectedValue(new Error('relation "BlogPost" does not exist'));
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-markdown"]);
  });

  it("一覧に本文は載せない", async () => {
    findMany.mockResolvedValue([dbRow]);
    const posts = await loadBlogPosts();

    expect("body" in posts[0]).toBe(false);
  });

  // 公開日と同じ日なら「更新」を出さない。Markdown で updatedAt を
  // 省いたときと同じ見え方にするため。
  it("更新日が公開日と同じなら updatedAt を出さない", async () => {
    findMany.mockResolvedValue([dbRow]);
    const [post] = await loadBlogPosts();
    expect(post.updatedAt).toBeUndefined();

    findMany.mockResolvedValue([
      { ...dbRow, updatedAt: new Date("2026-08-12T00:00:00+09:00") },
    ]);
    const [updated] = await loadBlogPosts();
    expect(updated.updatedAt).toBe("2026-08-12");
  });
});

describe("loadBlogPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DB にあれば本文つきで出す", async () => {
    findFirst.mockResolvedValue(dbRow);
    const post = await loadBlogPost("from-db");

    expect(post?.body).toBe("DB の本文");
    // 読了時間は Markdown 側と同じ関数で数える
    expect(post?.readingMinutes).toBeGreaterThan(0);
  });

  it("DB に無ければ Markdown を見る", async () => {
    findFirst.mockResolvedValue(null);
    const post = await loadBlogPost("from-markdown");

    expect(post?.body).toBe("ファイルの本文");
  });

  it("どちらにも無ければ undefined", async () => {
    findFirst.mockResolvedValue(null);
    expect(await loadBlogPost("nowhere")).toBeUndefined();
  });

  it("DB が読めなくても Markdown を見る", async () => {
    findFirst.mockRejectedValue(new Error("connection refused"));
    const post = await loadBlogPost("from-markdown");

    expect(post?.slug).toBe("from-markdown");
  });

  // 下書きは公開ページに出さない。where で published を絞っている。
  it("公開中のものだけを引く", async () => {
    findFirst.mockResolvedValue(dbRow);
    await loadBlogPost("from-db");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "from-db", published: true },
      }),
    );
  });
});
