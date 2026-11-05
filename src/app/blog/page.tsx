import type { Metadata } from "next";
import { BlogIndex, blogIndexMetadata } from "@/components/blog/BlogIndex";
import { loadBlogPosts } from "@/lib/blogStore";

export function generateMetadata(): Metadata {
  return blogIndexMetadata();
}

/**
 * 60 秒で作り直す（ISR）。
 *
 * searchParams を読むと動的描画になり、この値は無視される
 * （cache-control: private, no-store）。新着順は /blog/sort/date。
 * 記事頁と同じ 60 秒。ここを大きくしても、ルート内のより短い
 * revalidate があればそちらが勝つ。
 */
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await loadBlogPosts();
  return <BlogIndex posts={posts} sort="category" />;
}
