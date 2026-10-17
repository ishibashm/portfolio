// @vitest-environment node
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getBlogPost } from "@/lib/blog";
import { GUIDE_PAGES } from "@/lib/guideContent";
import { availableFaq, faqData, FAQ_TOOL_QUESTIONS } from "@/lib/faq";

function article(slug: string) {
  const post = getBlogPost(slug);
  expect(post, slug).toBeDefined();
  expect(post?.draft, slug).toBe(false);
  return post?.body ?? "";
}
function numbersMatch(text: string, source: string) {
  for (const number of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    expect(
      source.match(/\d+(?:\.\d+)?/g) ?? [],
      `${text}: ${number}`,
    ).toContain(number);
  }
}
it("FAQの出典は公開記事・用語・llmsだけで、数字は本文に存在する", () => {
  for (const item of faqData.items) {
    const sources = item.sources
      .map((source) => {
        expect(source.url).toBe(
          `https://cloud-palette.com/${source.type === "article" ? "blog/" : source.type === "guide" ? "guide/" : ""}${source.slug}`,
        );
        return source.type === "article"
          ? article(source.slug)
          : source.type === "guide"
            ? JSON.stringify(
                GUIDE_PAGES.find((page) => page.slug === source.slug),
              )
            : readFileSync("src/app/llms.txt/route.ts", "utf8");
      })
      .join("\n");
    numbersMatch(item.answer, sources);
    for (const tool of item.relatedTools)
      expect(FAQ_TOOL_QUESTIONS[tool]).toBeTruthy();
    if (item.asOf) {
      expect(item.asOf).toMatch(/^\d{4}$/);
      expect(Number(item.asOf)).toBeLessThanOrEqual(new Date().getFullYear());
      if (Number(item.asOf) < new Date().getFullYear())
        console.warn(`FAQ更新対象: ${item.id}`);
    }
  }
  for (const item of faqData.trivia)
    numbersMatch(item.text, article(item.source));
});
it("年依存のFAQは対象年だけ表示する", () => {
  expect(availableFaq(new Date("2026-07-01T00:00:00Z"))).toHaveLength(
    faqData.items.length,
  );
  expect(
    availableFaq(new Date("2026-12-31T15:00:00Z")).every((item) => !item.asOf),
  ).toBe(true);
  expect(
    availableFaq(new Date("2025-07-01T00:00:00Z")).every((item) => !item.asOf),
  ).toBe(true);
});
