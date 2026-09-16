import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupsForTags,
  MAX_ARTICLE_TOOLS,
  toolsForArticle,
} from "@/lib/articleTools";
import { CORE_ROUTES } from "@/lib/siteStructure";

/**
 * 記事の末尾の、道具への導線。
 *
 * 記事 31 本の末尾には「記事一覧へ戻る」しか無く、道具への導線が
 * 1 本も無かった（2026-09-16）。年別の早見表には物件検索への導線が
 * あるのに、記事だけ行き止まりだった。ここでは
 *
 *   1. 記事の頁が実際にこの部品を出していること（繋がっていること）
 *   2. どの記事にも 1〜3 件、CORE_ROUTES に実在する道具が出ること
 *   3. 記事の主題に合った群の道具が出ること
 *
 * を固定する。未使用のまま残った作りかけが何度も見つかっているので、
 * 部品の単体だけでは足りない（newArticlesLinked と同じ理由）。
 */

const BLOG_DIR = join(process.cwd(), "content", "blog");

function tagsOf(slug: string): string[] {
  const src = readFileSync(join(BLOG_DIR, `${slug}.md`), "utf8");
  const line = src.match(/^tags:\s*(.+)$/m);
  return line ? line[1].split(",").map((t) => t.trim()) : [];
}

const SLUGS = readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));

describe("記事の頁から繋がっている", () => {
  it("記事の頁が ArticleToolCta を本文の直後に出す", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "app", "blog", "[slug]", "page.tsx"),
      "utf8",
    );
    expect(src).toContain("<ArticleToolCta tags={post.tags} />");
    // 本文 → 導線 → 広告 の順。広告の下だと本文の終わりで離脱した人に見えない
    const body = src.indexOf("<BlogArticleBody");
    const cta = src.indexOf("<ArticleToolCta");
    const ad = src.indexOf("<AdBanner", body);
    expect(body).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(body);
    expect(ad).toBeGreaterThan(cta);
  });
});

describe("どの記事にも道具が出る", () => {
  it.each(SLUGS)("%s", (slug) => {
    const tools = toolsForArticle(tagsOf(slug));
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools.length).toBeLessThanOrEqual(MAX_ARTICLE_TOOLS);
    for (const t of tools) {
      expect(CORE_ROUTES.map((r) => r.href)).toContain(t.href);
    }
    // 同じ道具を 2 回出さない
    expect(new Set(tools.map((t) => t.href)).size).toBe(tools.length);
  });
});

describe("記事の主題に合った道具が出る", () => {
  it("暦注の記事には日取りのカレンダー", () => {
    const hrefs = toolsForArticle(tagsOf("why-time-was-thought-lucky")).map(
      (t) => t.href,
    );
    expect(hrefs[0]).toBe("/calendar");
  });

  it("家賃相場の記事には相場の分析", () => {
    const hrefs = toolsForArticle(
      tagsOf("how-we-analyze-the-rental-market"),
    ).map((t) => t.href);
    expect(hrefs[0]).toBe("/relocation/market");
  });

  it("凶方位の記事には物件検索（生年月日と出発地で答えが出る道具）", () => {
    const hrefs = toolsForArticle(tagsOf("what-is-honmei-teki-satsu")).map(
      (t) => t.href,
    );
    expect(hrefs[0]).toBe("/relocation/arbitrage");
  });

  it("天中殺と吉方位の記事には、時期と方位の両方", () => {
    const hrefs = toolsForArticle(
      tagsOf("tenchusatsu-and-lucky-directions"),
    ).map((t) => t.href);
    expect(hrefs).toContain("/calendar");
    expect(hrefs).toContain("/relocation/arbitrage");
  });

  it("「統計」だけでは相場の群に入れない（方位の裏づけの記事）", () => {
    expect(
      groupsForTags(tagsOf("is-there-statistical-evidence-for-houi")),
    ).not.toContain("market");
  });

  it("タグが何にも当たらなければ方位の道具（サイトの主題）", () => {
    expect(groupsForTags([])).toEqual(["direction"]);
    expect(toolsForArticle(["歴史"])[0].href).toBe("/relocation/arbitrage");
  });
});
