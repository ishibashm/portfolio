import { NextResponse } from "next/server";
import { loadBlogPosts } from "@/lib/blogStore";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * 記事が DB に入るようになったので force-static は外す。
 *
 * ビルド時に焼き切ると、管理画面から出した記事が次のデプロイまで
 * 購読側に届かない。1 時間ごとに作り直す（下の Cache-Control の
 * s-maxage と同じ間隔にしてある）。
 *
 * middleware は /blog/feed.xml を通していない（src/middleware.ts の
 * matcher で除外済み）ので、ここが動的になっても Supabase への
 * 往復は増えない。
 */
export const revalidate = 3600;

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const posts = await loadBlogPosts();
  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      return `    <item>
      <title>${xml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${post.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${xml(post.description)}</description>
      ${post.tags.map((tag) => `<category>${xml(tag)}</category>`).join("\n      ")}
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(`${SITE_NAME} 引越しの読みもの`)}</title>
    <link>${SITE_URL}/blog</link>
    <description>${xml(SITE_DESCRIPTION)}</description>
    <language>ja</language>
    <lastBuildDate>${new Date(`${posts[0]?.updatedAt ?? posts[0]?.publishedAt ?? "2026-08-14"}T00:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
