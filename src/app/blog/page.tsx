import Link from "next/link";
import type { Metadata } from "next";
import { BookOpenText, Clock3, Rss } from "lucide-react";
import { getBlogPosts, formatBlogDate } from "@/lib/blog";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

const TITLE = "引越しの読みもの";
const DESCRIPTION =
  "吉方位、天中殺、75日の起点移動など、Cloud Paletteの計算で迷いやすい考え方を、実装上の規則と流派による解釈に分けて解説します。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/feed.xml" },
  },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/blog`,
    type: "website",
    images: ["/ogp.png"],
  },
};

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <main className="mx-auto max-w-[1700px] px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-300 pb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-rose-600">
              <BookOpenText className="h-4 w-4" />
              CLOUD PALETTE JOURNAL
            </div>
            <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight md:text-4xl">
              {TITLE}
            </h1>
            <p className="mt-4 max-w-[70ch] text-sm leading-7 text-slate-700">
              {DESCRIPTION}
            </p>
          </div>
          <a
            href="/blog/feed.xml"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-rose-400"
          >
            <Rss className="h-3.5 w-3.5" /> RSS
          </a>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="flex flex-col rounded-3xl border border-slate-300 bg-white/90 p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="rounded-full bg-rose-50 px-2.5 py-1 font-bold text-rose-700">
                  {post.category}
                </span>
                <time dateTime={post.publishedAt}>
                  {formatBlogDate(post.publishedAt)}
                </time>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" /> 約{post.readingMinutes}分
                </span>
              </div>
              <h2 className="mt-5 font-serif text-xl font-bold leading-8">
                <Link href={`/blog/${post.slug}`} className="hover:text-rose-600">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-[70ch] flex-1 text-sm leading-7 text-slate-600">
                {post.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="text-[11px] text-slate-500">
                    #{tag}
                  </span>
                ))}
              </div>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-6 inline-flex self-start rounded-full bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                記事を読む →
              </Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
