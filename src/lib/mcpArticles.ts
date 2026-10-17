import { articleSections, searchIndex } from "./articleIndex";
import { z } from "zod";
import type { BlogPostSummary } from "./blog";

export const articleSearchSchema = {
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(5).default(3),
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
export async function searchArticles(input: { query: string; limit?: number }) {
  const { query, limit } = z.object(articleSearchSchema).parse(input);
  const { loadSearchableBlogPosts } = await import("./blogStore");
  return searchIndex(
    await loadSearchableBlogPosts({ quiet: true }),
    query,
    limit,
  );
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
