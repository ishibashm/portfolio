import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 記事の取得口（DB 先・Markdown 後）。
 *
 * 守るのは 3 つ。
 *   1. DB に行があればそちらを出す
 *   2. **DB が空なら Markdown を出す。**取り込みを流す前にコードが本番へ
 *      出ても /blog を空にしないため
 *   3. 接続障害では DB 専用記事の 404 や不完全な一覧を控えない。
 *      Markdown にある記事の本文は接続障害でも返す。
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
      {
        slug: "agent-log-from-markdown",
        title: "作業ログ",
        description: "log",
        publishedAt: "2026-08-02",
        updatedAt: undefined,
        category: "その他",
        tags: ["AI"],
        draft: false,
        readingMinutes: 1,
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
        : slug === "agent-log-from-markdown"
          ? {
              slug: "agent-log-from-markdown",
              title: "作業ログ",
              description: "log",
              publishedAt: "2026-08-02",
              updatedAt: undefined,
              category: "その他",
              tags: ["AI"],
              draft: false,
              readingMinutes: 1,
              body: "ログ本文",
            }
          : undefined,
  };
});

import {
  loadBlogPost,
  loadBlogPosts,
  loadSearchableBlogPosts,
} from "@/lib/blogStore";

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
  beforeEach(() => vi.resetAllMocks());

  it("DB に行があればそちらを出す", async () => {
    findMany.mockResolvedValue([dbRow]);
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-db"]);
    expect(posts[0].tags).toEqual(["x", "y"]);
    expect(posts[0].publishedAt).toBe("2026-08-10");
  });

  it("DB が空なら Markdown を出す", async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-markdown"]);
  });

  it("全記事を非公開にしたDBからMarkdownを復活させない", async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue({ slug: "hidden" });
    expect(await loadBlogPosts()).toEqual([]);
    findFirst.mockReset();
  });

  it("DB が読めなくても Markdown を出す", async () => {
    findMany.mockRejectedValue(new Error('relation "BlogPost" does not exist'));
    const posts = await loadBlogPosts();

    expect(posts.map((p) => p.slug)).toEqual(["from-markdown"]);
  });

  it.each([
    { code: "P1001" },
    { code: "P1002" },
    { code: "P1008" },
    { code: "P1017" },
    { code: "P2024" },
    { code: "P2037" },
    { code: "ECONNREFUSED" },
    { code: "P2010", meta: { code: "57014" } },
    { meta: { driverAdapterError: { cause: { kind: "ConnectionClosed" } } } },
    { cause: { code: "ETIMEDOUT" } },
    { meta: { driverAdapterError: new Error("DatabaseNotReachable") } },
    new Error("timeout exceeded when trying to connect"),
  ])("接続障害では不完全な一覧を返さない: %j", async (error) => {
    findMany.mockRejectedValue(error);
    await expect(loadBlogPosts({ quiet: true })).rejects.toBe(error);
    await expect(loadSearchableBlogPosts({ quiet: true })).rejects.toBe(error);
  });

  it("空の一覧の seeded 確認が失敗しても伝播する", async () => {
    findMany.mockResolvedValue([]);
    const error = Object.assign(new Error("unavailable"), { code: "P1001" });
    findFirst.mockRejectedValue(error);
    await expect(loadBlogPosts({ quiet: true })).rejects.toBe(error);
  });

  it("slug が agent- の公開済み行は一覧に出さない", async () => {
    findMany.mockResolvedValue([
      dbRow,
      {
        ...dbRow,
        slug: "agent--cosmic-report-void-of-course-alignment-deep-calibration-sequence-1781282092303",
        title: "作業ログ",
      },
    ]);
    const posts = await loadBlogPosts();
    expect(posts.map((p) => p.slug)).toEqual(["from-db"]);
  });

  it("公開行が作業ログだけなら Markdown を復活させない", async () => {
    findMany.mockResolvedValue([
      {
        ...dbRow,
        slug: "agent-only",
      },
    ]);
    expect(await loadBlogPosts()).toEqual([]);
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
  beforeEach(() => vi.resetAllMocks());

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

  it.each([
    new Error("connection refused"),
    Object.assign(new Error("unavailable"), { code: "P1001" }),
    new Error("timeout exceeded when trying to connect"),
  ])("接続障害で Markdown に無い slug は例外を伝播する: %j", async (error) => {
    findFirst.mockRejectedValue(error);
    await expect(loadBlogPost("db-only", { quiet: true })).rejects.toBe(error);
    await expect(
      loadBlogPost("from-markdown", { quiet: true }),
    ).resolves.toMatchObject({
      slug: "from-markdown",
      title: "ファイルの記事",
      description: "md",
      body: "ファイルの本文",
    });
  });

  it("seeded 確認中の接続障害も記事なしに変えない", async () => {
    const error = Object.assign(new Error("unavailable"), { code: "P2024" });
    findFirst.mockResolvedValueOnce(null).mockRejectedValueOnce(error);
    await expect(loadBlogPost("db-only", { quiet: true })).rejects.toBe(error);
  });

  it.each([new Error('relation "BlogPost" does not exist'), { code: "P2021" }])(
    "表が未適用なら従来の Markdown フォールバックを残す: %j",
    async (error) => {
      findFirst.mockRejectedValue(error);
      await expect(
        loadBlogPost("from-markdown", { quiet: true }),
      ).resolves.toMatchObject({
        body: "ファイルの本文",
      });
      await expect(
        loadBlogPost("nowhere", { quiet: true }),
      ).resolves.toBeUndefined();
    },
  );

  // 下書き・非公開は公開ページに出さない。
  it("非公開の行は Markdown に落とさず undefined", async () => {
    // 以前は published: true で引いて無ければ Markdown を見ていたので、
    // 管理画面で非公開にした記事も content/blog の写しでそのまま開けた
    findFirst.mockResolvedValue({ ...dbRow, published: false });
    expect(await loadBlogPost("from-markdown")).toBeUndefined();
  });

  it("slug が agent- の行は published でも出さない", async () => {
    findFirst.mockResolvedValue({
      ...dbRow,
      slug: "agent--cosmic-report-void-of-course-alignment-deep-calibration-sequence-1781282092303",
      published: true,
    });
    expect(
      await loadBlogPost(
        "agent--cosmic-report-void-of-course-alignment-deep-calibration-sequence-1781282092303",
      ),
    ).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("Markdown 側の agent- も出さない", async () => {
    findFirst.mockResolvedValue(null);
    expect(await loadBlogPost("agent-log-from-markdown")).toBeUndefined();
  });

  it("DB に記事があるのに slug が無ければ 404（消した記事を復活させない）", async () => {
    findFirst
      .mockResolvedValueOnce(null) // その slug の行は無い
      .mockResolvedValueOnce({ slug: "other" }); // だが DB は空ではない
    expect(await loadBlogPost("from-markdown")).toBeUndefined();
  });
});
