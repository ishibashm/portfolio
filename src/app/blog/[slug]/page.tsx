import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock3 } from "lucide-react";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/JsonLd";
import { extractFaq, hasEnoughFaq } from "@/lib/articleFaq";
import { AdBanner } from "@/components/ads/AdBanner";
import {
  getBlogPosts as getMarkdownBlogPosts,
  formatBlogDate,
} from "@/lib/blog";
import { loadBlogPost, loadBlogPosts } from "@/lib/blogStore";
import { pickRelatedPosts } from "@/lib/blogRelated";
import { blogTopic } from "@/lib/comments";
import { DirectionComments } from "@/components/comments/DirectionComments";
import { SITE_NAME } from "@/lib/siteStructure";
import { DEFAULT_SOCIAL_IMAGE, blogImagePath } from "@/lib/blogImage";
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
      images: [blogImagePath(post.slug)],
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
  /* 記事ごとの図。共通の画像に落ちているときは本文に出さない
     （og:image と構造化データには引き続き使う）。 */
  const socialImage = blogImagePath(post.slug);
  const heroImage = socialImage === DEFAULT_SOCIAL_IMAGE ? null : socialImage;
  // 自分以外を全部出していた。3 本の頃は 2 件で済んでいたが、23 本に
  // なった時点で全記事の脇に 22 件が並んでいた（lib/blogRelated）。
  const related = pickRelatedPosts(post, await loadBlogPosts());
  const headings = extractHeadings(post.body);
  /*
    問いの形の見出しと直後の段落を組にして FAQPage に出す。**本文から
    取るだけ**で、構造化データのために書き足さない（lib/articleFaq）。
    2 組そろわない記事では出さない。
  */
  const faq = extractFaq(post.body);

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
        image={socialImage}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "引越しの読みもの", path: "/blog" },
          { name: post.title, path },
        ]}
      />
      {hasEnoughFaq(faq) && <FaqJsonLd items={faq} />}

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

            {/*
              記事の図。`public/blog/<slug>.png` があるときだけ出す。
              共通の /ogp.png はサイトの顔であって記事の中身ではないので、
              本文の頭に置くと「どの記事も同じ絵」になる。

              置き場所は説明文の直後。図の中身は記事の主張そのもの
              （「本命的殺の方位は毎年動く」など）なので、見出しと説明を
              読んだ直後がいちばん効く。

              大きさを属性で持たせて、読み込み前に場所を取らせる。無いと
              本文が読み込みのたびに下へ飛ぶ。
            */}
            {heroImage && (
              <figure className="mt-8 m-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={`${post.title} — 記事の要点を図にしたもの`}
                  width={1800}
                  height={945}
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-auto rounded-xl border border-stone-200"
                />
              </figure>
            )}

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

        {/*
          投稿欄は**記事だけ**に置く（利用者の指示）。道具の画面や
          方位・暦の頁には出さない。

          幅は本文と同じ器の中に入れる。ここだけ別の数字にすると、
          すぐ上の本文と左右の位置がずれる（CLAUDE.md 3 節）。

          鍵は blogTopic で作る。文字列を組み立てて渡すと表記ゆれで
          別の記事の投稿になる。
        */}
        <div className="mt-10">
          <DirectionComments
            topicKey={blogTopic(post.slug)}
            heading="この記事についての投稿"
            prompt="記事の内容について、自分の場合はどうだったかを書いてください。実際に動いたあとどうだったかまで書けると、同じことで迷っている人の判断材料になります。"
          />
        </div>
      </main>
    </div>
  );
}
