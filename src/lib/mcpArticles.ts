import { articleSections, searchIndex } from "./articleIndex";
import { z } from "zod";
import type { BlogPost, BlogPostSummary } from "./blog";
import { STAR_NAMES } from "./kigakuContent";

export const articleSearchSchema = {
  query: z.string().trim().min(1).max(100).optional(),
  star: z.number().int().min(1).max(9).optional(),
  aspect: z.enum(["honmei", "getsumei", "both"]).default("honmei"),
  limit: z.number().int().min(1).max(20).default(3),
};
export const articleGetSchema = {
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  section: z.string().trim().min(1).max(200).optional(),
};
function summary(p: BlogPostSummary) {
  return {
    title: p.title.slice(0, 200),
    slug: p.slug,
    description: p.description.slice(0, 400),
    url: `https://cloud-palette.com/blog/${encodeURIComponent(p.slug)}`,
    publishedAt: p.publishedAt,
    tags: p.tags.slice(0, 10).map((t) => t.slice(0, 60)),
  };
}
const articleSearchInput = z.object(articleSearchSchema);

function searchStarArticles(
  posts: BlogPost[],
  star: number,
  aspect: "honmei" | "getsumei" | "both",
  limit: number,
  query?: string,
) {
  const starName = STAR_NAMES[star];
  const otherNames = Object.values(STAR_NAMES).filter(
    (name) => name !== starName,
  );
  const articles = posts.flatMap((post) => {
    if (post.draft) return [];
    const { title, tags, description, body } = post;
    const text = [title, ...tags, body];
    const mentionsGetsumei = text.some((value) => value.includes("月命星"));
    if (aspect === "getsumei" && !mentionsGetsumei) return [];
    if (
      query &&
      ![...text, description].some((value) => value.includes(query))
    ) {
      return [];
    }

    const sections = articleSections(body);
    const exactSection = sections.find(({ heading }) => heading === starName);
    const matchingHeading = sections.find(({ heading }) =>
      heading.includes(starName),
    );
    const titleMatch = title.includes(starName);
    const exactTag = tags.includes(starName);
    const descriptionMatch = description.includes(starName);
    const bodyMatches = sections.reduce(
      (count, { text }) => count + text.split(starName).length - 1,
      0,
    );
    const tagMatch = tags.some((tag) => tag.includes(starName));
    const mentionsStar =
      titleMatch ||
      tagMatch ||
      descriptionMatch ||
      matchingHeading ||
      bodyMatches > 0;
    const coversOtherStar = otherNames.some((name) =>
      [title, ...tags].some((value) => value.includes(name)),
    );
    if (
      !mentionsStar &&
      (aspect === "honmei" || !mentionsGetsumei || coversOtherStar)
    )
      return [];

    const dedicated = (titleMatch || exactTag) && !coversOtherStar;
    // Exact headings lead related results, followed by tags, titles, descriptions,
    // partial headings and capped body mentions. Generic 月命星 articles score zero.
    const score =
      (exactSection ? 100 : matchingHeading ? 25 : 0) +
      (exactTag ? 80 : tagMatch ? 1 : 0) +
      (titleMatch ? 60 : 0) +
      (descriptionMatch ? 30 : 0) +
      Math.min(bodyMatches * 8, 40);
    const snippet =
      (exactSection ?? matchingHeading)?.text.trim() || description;
    return [
      {
        ...summary(post),
        kind: "article" as const,
        relation: dedicated ? ("dedicated" as const) : ("related" as const),
        score,
        snippet: snippet.slice(0, 400),
        ...(exactSection ? { section: exactSection.heading } : {}),
      },
    ];
  });
  articles.sort(
    (a, b) =>
      Number(b.relation === "dedicated") - Number(a.relation === "dedicated") ||
      b.score - a.score ||
      b.publishedAt.localeCompare(a.publishedAt) ||
      a.slug.localeCompare(b.slug),
  );
  const dedicatedCount = articles.filter(
    ({ relation }) => relation === "dedicated",
  ).length;
  return {
    star,
    starName,
    dedicatedCount,
    relatedCount: articles.length - dedicatedCount,
    articles: articles.slice(0, limit),
  };
}

type ArticleSearchInput = z.input<typeof articleSearchInput>;
export function searchArticles(
  input: ArticleSearchInput & { query: string; star?: undefined },
): Promise<ReturnType<typeof searchIndex>>;
export function searchArticles(
  input: ArticleSearchInput & { star: number },
): Promise<ReturnType<typeof searchStarArticles>>;
export function searchArticles(
  input: ArticleSearchInput,
): Promise<
  ReturnType<typeof searchIndex> | ReturnType<typeof searchStarArticles>
>;
export async function searchArticles(input: ArticleSearchInput) {
  const { query, limit, star, aspect } = articleSearchInput.parse(input);
  if (star === undefined && (!query || limit > 5)) {
    throw new Error("query は必須で、limit は最大5件です。");
  }
  const { loadSearchableBlogPosts } = await import("./blogStore");
  const posts = await loadSearchableBlogPosts({ quiet: true });
  if (star !== undefined)
    return searchStarArticles(posts, star, aspect, limit, query);
  return searchIndex(posts, query ?? "", limit);
}
export async function getArticle(input: { slug: string; section?: string }) {
  const { slug, section } = z.object(articleGetSchema).parse(input);
  const { loadBlogPost } = await import("./blogStore");
  const post = await loadBlogPost(slug, { quiet: true });
  if (!post || post.draft) return { found: false };
  const all = articleSections(post.body);
  const at = section ? all.findIndex((part) => part.heading === section) : 0;
  if (at < 0) return { found: false };
  const body = section
    ? all
        .slice(at)
        .map((part) => `## ${part.heading}\n${part.text}`)
        .join("\n")
    : post.body;
  const excerpt = body.slice(0, 4000);
  const sections = articleSections(excerpt);
  return {
    found: true,
    ...summary(post),
    sections,
    truncated: body.length > excerpt.length,
  };
}
