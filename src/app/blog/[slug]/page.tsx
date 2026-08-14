import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock3 } from "lucide-react";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import {
  getBlogPosts as getMarkdownBlogPosts,
  formatBlogDate,
} from "@/lib/blog";
import { loadBlogPost, loadBlogPosts } from "@/lib/blogStore";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";
import { extractHeadings } from "@/lib/blogToc";

/**
 * DB に入れた記事は、ビルド時には存在しない。焼き切らずに受ける。
 *
 * dynamicParams を false のままにすると、管理画面から出した記事の URL が
 * 404 になる（generateStaticParams が返した slug 以外を拒むため）。
 */
export const dynamicParams = true;
/**
 * 60 秒。ルートレイアウトの fetch が revalidate: 60 を持っており、Next は
 * ルート内でいちばん小さい値を採るので、ここを大きくしても効かない。
 * 実際に効く値を書く（/blog も同じ）。
 */
export const revalidate = 60;

/**
 * 事前に焼く slug は **Markdown 側だけ**から出す。
 *
 * ここで DB を引くと、ビルドが DB へ繋がることを前提にしてしまう。
 * 繋がらなければビルドごと落ちる。DB にしか無い記事は dynamicParams で
 * 初回アクセス時に組めばよく、事前生成は「確実に手元にあるもの」に
 * 限るのが安全。
 */
export function generateStaticParams() {
  return getMarkdownBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadBlogPost(slug);
  if (!post) return {};

  const path = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: path },
    openGraph: {
      title: `${post.title} | ${SITE_NAME}`,
      description: post.description,
      url: `${SITE_URL}${path}`,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      tags: post.tags,
      images: ["/ogp.png"],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadBlogPost(slug);
  if (!post) notFound();

  const path = `/blog/${post.slug}`;
  const related = (await loadBlogPosts()).filter(
    (item) => item.slug !== post.slug,
  );
  const headings = extractHeadings(post.body);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <ArticleJsonLd
        type="BlogPosting"
        headline={post.title}
        description={post.description}
        path={path}
        keywords={post.tags}
        datePublished={post.publishedAt}
        dateModified={post.updatedAt}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "引越しの読みもの", path: "/blog" },
          { name: post.title, path },
        ]}
      />

      <main className="mx-auto max-w-[1700px] px-5 py-10 md:py-14">
        <nav className="text-xs text-slate-500">
          <Link href="/blog" className="font-bold hover:text-rose-600">
            引越しの読みもの
          </Link>
          <span className="mx-2">/</span>
          <span>{post.category}</span>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <article>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="rounded-full bg-rose-50 px-3 py-1 font-bold text-rose-700">
                {post.category}
              </span>
              <time dateTime={post.publishedAt}>
                公開 {formatBlogDate(post.publishedAt)}
              </time>
              {post.updatedAt && post.updatedAt !== post.publishedAt && (
                <time dateTime={post.updatedAt}>
                  更新 {formatBlogDate(post.updatedAt)}
                </time>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" /> 約{post.readingMinutes}分
              </span>
            </div>

            <h1 className="mt-5 font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl md:leading-tight">
              {post.title}
            </h1>
            <p className="mt-5 border-l-4 border-rose-300 pl-4 text-sm leading-7 text-slate-600">
              {post.description}
            </p>

            <div className="mt-8">
              <BlogArticleBody body={post.body} />
            </div>

            <div className="mt-12">
              <AdBanner />
            </div>

            <div className="mt-10 border-t border-slate-300 pt-6">
              <Link
                href="/blog"
                className="text-sm font-bold text-rose-600 hover:underline"
              >
                ← 記事一覧へ戻る
              </Link>
            </div>
          </article>

          <aside className="space-y-5 lg:sticky lg:top-8">
            <section className="rounded-2xl border border-slate-300 bg-white/80 p-5">
              <h2 className="font-serif text-sm font-bold">この記事のタグ</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-slate-600"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </section>

            {related.length > 0 && (
              <section className="rounded-2xl border border-slate-300 bg-white/80 p-5">
                <h2 className="font-serif text-sm font-bold">あわせて読む</h2>
                <div className="mt-3 space-y-3">
                  {related.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/blog/${item.slug}`}
                      className="block text-xs font-semibold leading-5 text-slate-700 hover:text-rose-600"
                    >
                      {item.title} →
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* 目次は「あわせて読む」の下（運営者の指定）。本文の横に
                独立した段として置いていたときは、目次が短いのでその下が
                丸ごと余白になっていた。見出しが 1 つでは目次にならない
                ので 2 つから出す。アンカー id は描画側（BlogArticleBody の
                h2）と同じ headingId で作っているため、必ず飛べる。 */}
            {headings.length >= 2 && (
              <nav
                aria-label="目次"
                className="rounded-2xl border border-slate-300 bg-white/80 p-5"
              >
                <h2 className="font-serif text-sm font-bold">目次</h2>
                <ol className="mt-3 space-y-2.5 text-xs leading-5">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className="text-slate-600 hover:text-rose-600"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
