import Link from "next/link";
import { BlogCardVideo } from "@/components/blog/BlogCardVideo";
import type { Metadata } from "next";
import { BookOpenText, Clock3, Rss } from "lucide-react";
import { formatBlogDate } from "@/lib/blog";
import type { BlogPostSummary } from "@/lib/blog";
import { groupPostsByCategory } from "@/lib/blogCategories";
import { pageOpenGraph } from "@/lib/siteUrl";
import { currentYearInJapan } from "@/lib/kigakuContent";

const DESCRIPTION =
  "吉方位、天中殺、75日の起点移動など、Cloud Paletteの計算で迷いやすい考え方を、実装上の規則と流派による解釈に分けて解説します。";

export function blogIndexTitle(): string {
  return `九星気学・方位・天中殺の記事一覧（${currentYearInJapan()}年）`;
}

/**
 * カテゴリ別も新着順も正典は /blog。並べ替えは別の頁ではない。
 */
export function blogIndexMetadata(): Metadata {
  const title = blogIndexTitle();
  return {
    title,
    description: DESCRIPTION,
    alternates: {
      canonical: "/blog",
      types: { "application/rss+xml": "/blog/feed.xml" },
    },
    openGraph: pageOpenGraph("/blog", title, DESCRIPTION),
  };
}

export type BlogSortMode = "category" | "date";

/**
 * 記事 1 本ぶんの札。
 *
 * カテゴリ別と新着順で同じ見た目を使う。同じ札を 2 か所に書かない。
 */
function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <article className="flex flex-col rounded-3xl border border-slate-300 bg-white/90 p-6 shadow-sm">
      <BlogCardVideo post={post} />
      {/* カテゴリの札はここには出さない。節の見出しが同じことを
          言っているので、同じ語が節の中で 10 回並ぶだけになる。 */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <time dateTime={post.publishedAt}>
          {formatBlogDate(post.publishedAt)}
        </time>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" /> 約{post.readingMinutes}分
        </span>
      </div>
      {/* 節の見出しが h2 になったので、カードの題は h3。
          見出しの段を飛ばすと読み上げの目次が崩れる。 */}
      <h3 className="mt-4 font-serif text-lg font-bold leading-7">
        <Link href={`/blog/${post.slug}`} className="hover:text-rose-600">
          {post.title}
        </Link>
      </h3>
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
  );
}

function postsByDate(posts: BlogPostSummary[]): BlogPostSummary[] {
  /*
    新着順。loadBlogPosts の並びに依存しない（呼ぶ側で並べ替えている
    ことが読めないと、上流を変えたときに静かに崩れる）。

    publishedAt は YYYY-MM-DD なので文字列比較で日付順になる。同じ日は
    slug 昇順に倒して並びを決定的にする。同着で順が揺れると、
    再読み込みのたびにカードが入れ替わって読み手が迷う。
  */
  return [...posts].sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) ||
      a.slug.localeCompare(b.slug),
  );
}

/**
 * 記事一覧。searchParams は読まない。
 *
 * ?sort= を頁が読むと動的描画になり、revalidate が無視されて
 * cache-control: private, no-store になる。新着順は /blog/sort/date を
 * 事前生成し、next.config の rewrite で /blog?sort=date をそこへ振る。
 * 公開 URL と canonical（/blog）は変えない。
 *
 * どちらか一方の並びだけを描く。両方を 1 つの HTML に持たない。
 */
export function BlogIndex({
  posts,
  sort,
}: {
  posts: BlogPostSummary[];
  sort: BlogSortMode;
}) {
  const groups = sort === "category" ? groupPostsByCategory(posts) : [];
  const byDate = sort === "date" ? postsByDate(posts) : [];
  const title = blogIndexTitle();

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
              {title}
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

        {/* 並べ替え。Link なのでサーバで組み直され、どちらの並びも
            そのまま読める HTML になる。公開 URL は ?sort=date のまま。 */}
        <nav aria-label="並べ替え" className="mt-8 flex flex-wrap gap-2">
          {(
            [
              { mode: "category", label: "カテゴリ別", href: "/blog" },
              { mode: "date", label: "新着順", href: "/blog?sort=date" },
            ] as const
          ).map((opt) => {
            const on = sort === opt.mode;
            return (
              <Link
                key={opt.mode}
                href={opt.href}
                aria-current={on ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-xs font-bold ${
                  on
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-slate-300 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-600"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </nav>

        {/* 上の索引。節へ飛ぶだけだが、記事が並ぶと
            「何の話が置いてあるか」がここで分かる。新着順のときは
            節そのものが無いので出さない。 */}
        {sort === "category" && (
          <nav aria-label="カテゴリ" className="mt-4 flex flex-wrap gap-2">
            {groups.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-rose-400 hover:text-rose-600"
              >
                {group.category}
                <span className="text-[11px] font-normal text-slate-500">
                  {group.posts.length}
                </span>
              </a>
            ))}
          </nav>
        )}

        {sort === "date" ? (
          /* 新着順。節を作らず、全部を 1 つの格子に並べる。 */
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {byDate.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="mt-12">
              <h2
                id={group.id}
                className="scroll-mt-6 border-b border-slate-300 pb-2 font-serif text-xl font-bold"
              >
                {group.category}
                <span className="ml-3 text-xs font-normal text-slate-500">
                  {group.posts.length}本
                </span>
              </h2>

              {/* 器は 1700px。2 列のままだとカードが横に間延びするだけで、
                  広げた幅が何も買わない。 */}
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
