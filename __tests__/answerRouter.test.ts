// @vitest-environment node
import { expect, it, vi } from "vitest";
import { AnswerCache } from "@/lib/answerCache";
import { answerSource } from "@/lib/answerSource";
import { canRoutePublicQuestion, routePublicAnswer } from "@/lib/answerRouter";
vi.mock("@/lib/blogStore", () => ({
  loadSearchableBlogPosts: vi.fn(async () => [
    {
      slug: "moving",
      title: "風水とは何ですか？",
      description: "風水の考え方",
      tags: [],
      draft: false,
      publishedAt: "2026-01-01",
      category: "説明",
      readingMinutes: 1,
      body: "## 先に結論\n風水は住まいについての伝統的な考え方です。流派によって解釈が異なります。科学的効果を断定する説明ではありません。",
    },
  ]),
}));
it("TTL・LRU・モデルと索引版を区別する", () => {
  const cache = new AnswerCache<string>(2, 10);
  const key = cache.key("公開の問い", "google:a", "v1");
  expect(key).not.toContain("公開");
  expect(cache.key("公開の問い", "google:b", "v1")).not.toBe(key);
  expect(cache.key("公開の問い", "google:a", "v2")).not.toBe(key);
  cache.set(key, "a", 0);
  cache.set("b", "b", 0);
  expect(cache.get(key, 1)).toBe("a");
  cache.set("c", "c", 1);
  expect(cache.get("b", 2)).toBeUndefined();
  expect(cache.get(key, 10)).toBeUndefined();
});
it("個人情報・履歴・計算相談は無料資料ルートとキャッシュを通らない", () => {
  for (const question of [
    "私の方位は？",
    "1988年の生まれですか？",
    "東京都の方位とは？",
    "今年の吉日は？",
    "北へ引っ越していいですか？",
  ])
    expect(canRoutePublicQuestion(question, {}), question).toBe(false);
  for (const context of [
    { profile: { residence: "東京" } },
    { memories: ["相談メモ"] },
    { history: [{ role: "user" as const, content: "前の質問" }] },
  ])
    expect(canRoutePublicQuestion("風水とは何ですか？", context)).toBe(false);
});
it("公開記事から抽出したFAQはLLMなしで出典付きで返す", async () => {
  const result = await routePublicAnswer(
    "風水とは何ですか？",
    {},
    "google:test",
  );
  expect(result?.at(-1)).toEqual({
    type: "done",
    source: "site",
    calls: 0,
    reasons: [],
  });
  expect(result?.[0]).toMatchObject({
    text: expect.stringContaining("/blog/moving#"),
  });
});
it("出どころは成功した実データから決め、空検索と失敗は資料扱いしない", () => {
  expect(answerSource([])).toBe("general");
  expect(
    answerSource([{ tool: "search_articles", output: { articles: [] } }]),
  ).toBe("general");
  expect(
    answerSource([{ tool: "get_article", output: { found: false } }]),
  ).toBe("general");
  expect(answerSource([{ tool: "get_article", output: { found: true } }])).toBe(
    "site",
  );
  expect(
    answerSource([{ tool: "judge_directions", output: { error: "failure" } }]),
  ).toBe("general");
  expect(
    answerSource([
      { tool: "get_article", output: { found: true } },
      { tool: "judge_directions", output: { directions: [] } },
    ]),
  ).toBe("calc");
});
