import { z } from "zod";
import type { BlogPostSummary } from "./blog";

export const articleSearchSchema = {
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(5).default(3),
};
export const articleGetSchema = {
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
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
  const { loadBlogPosts } = await import("./blogStore");
  const words = query.toLocaleLowerCase("ja").split(/\s+/);
  const posts = await loadBlogPosts({ quiet: true });
  return {
    articles: posts
      .filter(
        (p) =>
          !p.draft &&
          words.every((w) =>
            [p.title, p.description, ...p.tags]
              .join(" ")
              .toLocaleLowerCase("ja")
              .includes(w),
          ),
      )
      .slice(0, limit)
      .map(summary),
  };
}
export async function getArticle(input: { slug: string }) {
  const { slug } = z.object(articleGetSchema).parse(input);
  const { loadBlogPost } = await import("./blogStore");
  const post = await loadBlogPost(slug, { quiet: true });
  if (!post || post.draft) return { found: false };
  const excerpt = post.body.slice(0, 4000);
  const sections: { heading: string; text: string }[] = [];
  for (const part of excerpt.split(/(?=^#{1,6} )/m)) {
    const lines = part.split("\n");
    const heading = /^#{1,6} /.test(lines[0])
      ? lines.shift()!.replace(/^#+ /, "")
      : "";
    sections.push({ heading, text: lines.join("\n") });
  }
  return {
    found: true,
    ...summary(post),
    sections,
    truncated: post.body.length > excerpt.length,
  };
}
