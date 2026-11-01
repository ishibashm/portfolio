import { notFound } from "next/navigation";
import { loadBlogPost } from "@/lib/blogStore";
import { OG_HEIGHT, OG_WIDTH, ogImage } from "@/lib/og/card";

export const alt = "Cloud Palette の記事";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadBlogPost(slug);
  if (!post) notFound();
  return ogImage({
    eyebrow: post.category || "読みもの",
    title: post.title,
  });
}
