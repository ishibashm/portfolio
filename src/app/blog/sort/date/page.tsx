import type { Metadata } from "next";
import { BlogIndex, blogIndexMetadata } from "@/components/blog/BlogIndex";
import { loadBlogPosts } from "@/lib/blogStore";

/**
 * 新着順。事前生成する。
 *
 * 公開 URL は /blog?sort=date のまま（next.config の rewrite）。
 * canonical は /blog。このパス自体はサイトマップに載せない。
 */
export function generateMetadata(): Metadata {
  return blogIndexMetadata();
}

export const revalidate = 60;

export default async function BlogDatePage() {
  const posts = await loadBlogPosts();
  return <BlogIndex posts={posts} sort="date" />;
}
