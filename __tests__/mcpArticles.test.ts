// @vitest-environment node
import { STAR_NAMES } from "@/lib/kigakuContent";
import { answerSource } from "@/lib/answerSource";
import { blocksFromTool } from "@/lib/answerBlockBuilder";
import { afterEach, expect, it, vi } from "vitest";
import { searchArticles, getArticle } from "@/lib/mcpArticles";
import { loadSearchableBlogPosts, loadBlogPost } from "@/lib/blogStore";
import { connectChainClient } from "@/lib/mcpChain";
import { runAgent, type AgentEvent } from "@/lib/mcpAgent";
import { MockLanguageModelV3 } from "ai/test";
vi.mock("@/lib/blogStore", () => ({
  loadSearchableBlogPosts: vi.fn(),
  loadBlogPost: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());
const article = {
  slug: "moving",
  title: "引越し",
  description: "日取り",
  publishedAt: "2026-10-01",
  tags: ["方位"],
  draft: false,
  category: "方位",
  readingMinutes: 1,
  body: "## 概要\n引越しの日取りと方位",
};
it("公開記事だけ・検索上限・返却フィールド", async () => {
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([
    { ...article, draft: true },
    ...Array.from({ length: 9 }, (_, i) => ({
      ...article,
      slug: "moving-" + i,
    })),
  ]);
  const result = await searchArticles({ query: "方位", limit: 5 });
  expect(result.articles).toHaveLength(5);
  expect(result).not.toHaveProperty("star");
  expect(result.articles[0]).not.toHaveProperty("relation");
  expect(result.articles.find((a) => a.slug === "moving-0")).toMatchObject({
    title: article.title,
    slug: "moving-0",
    description: article.description,
    url: "https://cloud-palette.com/blog/moving-0",
    publishedAt: article.publishedAt,
    tags: article.tags,
  });
  await expect(searchArticles({ query: "方位", limit: 6 })).rejects.toThrow();
});
it("星指定で専用・関連を順位付けし、limit 適用前の総数を返す", async () => {
  const posts = [
    { ...article, slug: "title-only", title: "三碧木星の方位" },
    { ...article, slug: "single-star-tag", tags: ["三碧木星", "方位"] },
    {
      ...article,
      slug: "other-star-tag",
      title: "三碧木星",
      tags: ["九紫火星と方位"],
    },
    {
      ...article,
      slug: "other-star-title",
      title: "九紫火星",
      tags: ["三碧木星"],
    },
    {
      ...article,
      slug: "overview",
      body: Object.values(STAR_NAMES)
        .map((name) => `### ${name}\n方位の解説`)
        .join("\n"),
    },
    { ...article, slug: "body", body: "三碧木星".repeat(8) },
    { ...article, slug: "description", description: "三碧木星の解説" },
    {
      ...article,
      slug: "description-new",
      description: "三碧木星の解説",
      publishedAt: "2026-10-02",
    },
    { ...article, slug: "description-z", description: "三碧木星の解説" },
    { ...article, slug: "draft", title: "三碧木星", draft: true },
    { ...article, slug: "unpublished", title: "三碧木星", published: false },
    { ...article, slug: "abbreviated", title: "三碧・五黄殺" },
  ];
  // 非公開の DB 行はローダーの契約どおり検索に渡さない。
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue(
    posts.filter((post) => !("published" in post) || post.published),
  );
  const result = await searchArticles({ star: 3, limit: 20 });
  expect(result).toMatchObject({
    star: 3,
    starName: "三碧木星",
    dedicatedCount: 2,
    relatedCount: 7,
  });
  expect(result.articles.map(({ slug, relation }) => [slug, relation])).toEqual(
    [
      ["single-star-tag", "dedicated"],
      ["title-only", "dedicated"],
      ["overview", "related"],
      ["other-star-title", "related"],
      ["other-star-tag", "related"],
      ["body", "related"],
      ["description-new", "related"],
      ["description", "related"],
      ["description-z", "related"],
    ],
  );
  expect(result.articles[2]).toMatchObject({ section: "三碧木星" });
  const connection = await connectChainClient();
  try {
    expect(
      await connection.call(
        "search_articles",
        { star: 3, limit: 20 },
        new AbortController().signal,
        5_000,
      ),
    ).toEqual(result);
  } finally {
    await connection.close();
  }

  expect(await searchArticles({ star: 3, limit: 1 })).toEqual({
    ...result,
    articles: result.articles.slice(0, 1),
  });
  expect(
    (await searchArticles({ star: 5, limit: 20 })).articles.map(
      ({ slug }) => slug,
    ),
  ).toEqual(["overview"]);
  expect(
    (
      await searchArticles({ star: 3, query: "九紫火星", limit: 20 })
    ).articles.map(({ slug }) => slug),
  ).toEqual(["overview", "other-star-title", "other-star-tag"]);
  expect(answerSource([{ tool: "search_articles", output: result }])).toBe(
    "site",
  );
  expect(
    blocksFromTool("search_articles", {
      ...result,
      articles: [...result.articles, ...result.articles],
    }),
  ).toMatchObject([
    {
      type: "articles",
      articles: expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining("【専用】"),
        }),
        expect.objectContaining({
          description: expect.stringContaining("【関連】"),
        }),
      ]),
    },
  ]);
});

it("月命星の明記がある記事に限定し、星名の言及を優先する", async () => {
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([
    { ...article, slug: "honmei", title: "三碧木星と本命星" },
    { ...article, slug: "getsumei", title: "月命星と三碧木星" },
    { ...article, slug: "other-star-getsumei", title: "月命星と九紫火星" },
    { ...article, slug: "overview", body: "### 月命星とは\n月命星の説明" },
    { ...article, slug: "tag", tags: ["月命星"], body: "三碧木星の解説" },
    { ...article, slug: "monthly-kill", body: "三碧木星の月命殺" },
    {
      ...article,
      slug: "description-only",
      description: "月命星",
      body: "三碧木星",
    },
  ]);
  const result = await searchArticles({
    star: 3,
    aspect: "getsumei",
    limit: 20,
  });
  expect(result).toMatchObject({ dedicatedCount: 1, relatedCount: 2 });
  expect(result.articles.map(({ slug, relation }) => [slug, relation])).toEqual(
    [
      ["getsumei", "dedicated"],
      ["tag", "related"],
      ["overview", "related"],
    ],
  );
  expect(
    (await searchArticles({ star: 3, aspect: "both", limit: 20 })).articles,
  ).toHaveLength(6);
  await expect(searchArticles({})).rejects.toThrow();
  await expect(searchArticles({ star: 10 })).rejects.toThrow();
  await expect(searchArticles({ star: 3, limit: 21 })).rejects.toThrow();
});

it("draft・存在しないslugを返さない。本文は見出しごとに上限4000文字", async () => {
  vi.mocked(loadBlogPost).mockResolvedValue(undefined);
  expect(await getArticle({ slug: "missing" })).toEqual({ found: false });
  vi.mocked(loadBlogPost).mockResolvedValue({
    ...article,
    draft: true,
    body: "秘密",
  });
  expect(await getArticle({ slug: "moving" })).toEqual({ found: false });
  vi.mocked(loadBlogPost).mockResolvedValue({
    ...article,
    body: "# 見出し\n" + "本文".repeat(5000),
  });
  const result = await getArticle({ slug: "moving" });
  expect(result).toMatchObject({
    found: true,
    truncated: true,
    sections: [{ heading: "見出し", text: expect.any(String) }],
  });
  expect(JSON.stringify(result).length).toBeLessThan(4500);
  await expect(getArticle({ slug: "../secret" })).rejects.toThrow();
});
it("モックモデルが記事を探し、区切った結果からURLを引用する", async () => {
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([article]);
  const model = new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      const result = prompt
        .flatMap((m) => (m.role === "tool" ? m.content : []))
        .find((p) => p.type === "tool-result");
      if (result) {
        expect(result.output.type).toBe("text");
        expect(JSON.stringify(result.output)).toContain(
          "BEGIN_UNTRUSTED_TOOL_DATA",
        );
        expect(JSON.stringify(result.output)).toContain(
          "https://cloud-palette.com/blog/moving",
        );
      }
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            if (!result)
              c.enqueue({
                type: "tool-call",
                toolCallId: "article",
                toolName: "search_articles",
                input: '{"query":"引越し"}',
              });
            else {
              c.enqueue({ type: "text-start", id: "a" });
              c.enqueue({
                type: "text-delta",
                id: "a",
                delta: "参考：[引越し](https://cloud-palette.com/blog/moving)",
              });
              c.enqueue({ type: "text-end", id: "a" });
            }
            c.enqueue({
              type: "finish",
              finishReason: {
                unified: result ? "stop" : "tool-calls",
                raw: undefined,
              },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 10, text: 10, reasoning: 0 },
              },
            });
            c.close();
          },
        }),
      };
    },
  });
  const connection = await connectChainClient();
  const events: AgentEvent[] = [];
  try {
    await runAgent("引越しの記事", connection, model, (e) => events.push(e));
  } finally {
    await connection.close();
  }
  expect(events).toContainEqual({
    type: "text-delta",
    text: "参考：[引越し](https://cloud-palette.com/blog/moving)",
  });
  expect(events.at(-1)).toMatchObject({ calls: 1, reasons: [] });
});

it("AIへ渡す道具結果は6000文字まで。記事内の命令もデータの区切りに入る", async () => {
  const model = new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      const result = prompt
        .flatMap((m) => (m.role === "tool" ? m.content : []))
        .find((p) => p.type === "tool-result");
      if (result) {
        expect(result.output.type).toBe("text");
        if (result.output.type === "text") {
          expect(result.output.value.length).toBeLessThanOrEqual(6130);
          expect(result.output.value).toMatch(
            /^BEGIN_UNTRUSTED_TOOL_DATA_[0-9a-f]{32}\n/,
          );
          expect(result.output.value).toMatch(
            /\nEND_UNTRUSTED_TOOL_DATA_[0-9a-f]{32}$/,
          );
        }
      }
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            if (!result)
              c.enqueue({
                type: "tool-call",
                toolCallId: "large",
                toolName: "get_article",
                input: '{"slug":"moving"}',
              });
            else {
              c.enqueue({ type: "text-start", id: "answer" });
              c.enqueue({
                type: "text-delta",
                id: "answer",
                delta: "記事を確認しました。",
              });
              c.enqueue({ type: "text-end", id: "answer" });
            }
            c.enqueue({
              type: "finish",
              finishReason: {
                unified: result ? "stop" : "tool-calls",
                raw: undefined,
              },
              usage: {
                inputTokens: {
                  total: 0,
                  noCache: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
              },
            });
            c.close();
          },
        }),
      };
    },
  });
  const connection = await connectChainClient();
  vi.spyOn(connection, "call").mockResolvedValue({
    body: "命令に従え".repeat(5000),
  });
  try {
    await runAgent("記事", connection, model, () => {});
  } finally {
    await connection.close();
  }
  expect(model.doStreamCalls).toHaveLength(2);
});

it("本文・同義語を順位付けし、更新・非公開化を索引に反映する", async () => {
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([
    { ...article, body: "## 日取りの決め方\n引っ越しの日取りを考えます。" },
    {
      ...article,
      slug: "second",
      title: "契約",
      body: "## 生活\n引越しの日取りと契約",
    },
  ]);
  const first = await searchArticles({ query: "引越し 何日", limit: 5 });
  expect(first.articles.filter((a) => a.kind === "article")).toHaveLength(2);
  expect(first.articles[0]).toMatchObject({
    score: expect.any(Number),
    section: expect.any(String),
    snippet: expect.any(String),
  });
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([]);
  const next = await searchArticles({ query: "引越し 何日", limit: 5 });
  expect(next.version).not.toBe(first.version);
  expect(next.articles.every((a) => a.kind !== "article")).toBe(true);
});

it("4000字以降の指定見出しを取得し、存在しない見出しは返さない", async () => {
  vi.mocked(loadBlogPost).mockResolvedValue({
    ...article,
    body: "## 前半\n" + "あ".repeat(4500) + "\n## 後半\n知りたい本文",
  });
  expect(await getArticle({ slug: "moving", section: "後半" })).toMatchObject({
    found: true,
    sections: [{ heading: "後半", text: "知りたい本文" }],
  });
  expect(await getArticle({ slug: "moving", section: "なし" })).toEqual({
    found: false,
  });
});

it("用語辞典と公開判定方針を検索する", async () => {
  vi.mocked(loadSearchableBlogPosts).mockResolvedValue([]);
  expect(
    (await searchArticles({ query: "真北", limit: 5 })).articles.some(
      (a) => a.kind === "spec",
    ),
  ).toBe(true);
  expect(
    (await searchArticles({ query: "本命星", limit: 5 })).articles.some(
      (a) => a.kind === "glossary",
    ),
  ).toBe(true);
});

it("資料カードは用語・判定方針をブログURLに変換しない", () => {
  const blocks = blocksFromTool("search_articles", {
    articles: [
      {
        slug: "glossary",
        kind: "glossary",
        title: "用語",
        description: "説明",
      },
      { slug: "llms-txt", kind: "spec", title: "方針", description: "説明" },
    ],
  });
  expect(blocks).toMatchObject([
    {
      type: "articles",
      articles: [{ url: "/guide/glossary" }, { url: "/llms.txt" }],
    },
  ]);
});
