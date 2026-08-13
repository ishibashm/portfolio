import type { BlogPostSummary } from "@/lib/blog";

/**
 * ブログの効果検証。page_views の生の行を、記事ごとの指標に組み替える。
 *
 * ここに置くのは**純粋な関数だけ**。SQL は /api/metrics/summary が持つ。
 * 集計の SQL を直接テストするのは難しいが、組み替えの規則（記録の無い
 * 記事をどう出すか、率をどう出すか）は取り違えると数字が嘘になるので、
 * 分けてテストできる形にしておく。
 *
 * 効果検証で見たいのは 3 つ。
 *   1. 記事ごとに読まれているか（**0 の記事も出す**。一覧に出ない＝
 *      「読まれていない」が見えない、では検証にならない）
 *   2. どこから来ているか（検索なのか SNS なのか）— SQL 側
 *   3. 読んだあと道具まで届いているか — 下の buildBlogFunnel
 */

/** 記事本文のパス。/blog（一覧）は含めない。 */
const POST_PATH_PREFIX = "/blog/";

/** 一覧のパス。 */
export const BLOG_INDEX_PATH = "/blog";

/**
 * 効果検証で「道具まで届いた」と数えるパス（SQL の LIKE パターン）。
 *
 * 記事を読んだ人に触ってほしいのはここ。about や terms まで数えると
 * 「ブログ以外を見た率」になってしまい、導線の検証にならない。
 */
export const TOOL_PATH_PATTERNS = [
  "/relocation/%",
  "/houi",
  "/houi/%",
  "/calendar",
] as const;

export type BlogPathCount = { path: string; pv: number; uv: number };

export type BlogPostMetric = {
  slug: string;
  title: string;
  path: string;
  publishedAt: string;
  /** 公開からの日数。PV を「新しい記事だから少ない」と読み分けるため。 */
  daysSincePublished: number;
  pv: number;
  uv: number;
};

export type BlogMetrics = {
  /** 一覧（/blog）の PV / UV。記事の合計とは別に出す。 */
  index: { pv: number; uv: number };
  /** 記事の合計。 */
  posts: { pv: number; uv: number };
  /** 記事ごと。PV の多い順、同数なら新しい順。 */
  rows: BlogPostMetric[];
};

/** page_views の path が記事本文なら slug を返す。一覧・それ以外は null。 */
export function blogSlugFromPath(path: string): string | null {
  if (!path.startsWith(POST_PATH_PREFIX)) return null;
  const slug = path.slice(POST_PATH_PREFIX.length);
  // /blog/foo/bar のような深い階層は記事ではない。
  if (!slug || slug.includes("/")) return null;
  return slug;
}

/** "YYYY-MM-DD" 同士の日数差。負にはしない（未来日の記事は 0 日）。 */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * @param counts page_views から引いた /blog 配下の集計（1 パス 1 行）
 * @param posts 公開中の記事。**記録が 0 の記事もここから出す**
 * @param today JST の "YYYY-MM-DD"。公開からの日数の基準
 */
export function buildBlogMetrics(
  counts: BlogPathCount[],
  posts: BlogPostSummary[],
  today: string,
): BlogMetrics {
  const bySlug = new Map<string, BlogPathCount>();
  let index = { pv: 0, uv: 0 };

  for (const row of counts) {
    if (row.path === BLOG_INDEX_PATH) {
      index = { pv: row.pv, uv: row.uv };
      continue;
    }
    const slug = blogSlugFromPath(row.path);
    if (slug) bySlug.set(slug, row);
  }

  const rows: BlogPostMetric[] = posts.map((post) => {
    const hit = bySlug.get(post.slug);
    return {
      slug: post.slug,
      title: post.title,
      path: `${POST_PATH_PREFIX}${post.slug}`,
      publishedAt: post.publishedAt,
      daysSincePublished: daysBetween(post.publishedAt, today),
      pv: hit?.pv ?? 0,
      uv: hit?.uv ?? 0,
    };
  });

  rows.sort(
    (a, b) => b.pv - a.pv || b.publishedAt.localeCompare(a.publishedAt),
  );

  return {
    index,
    posts: {
      pv: rows.reduce((sum, r) => sum + r.pv, 0),
      uv: rows.reduce((sum, r) => sum + r.uv, 0),
    },
    rows,
  };
}

export type BlogFunnel = {
  /** ブログを見た「人日」。同じ人の別の日は別に数える。 */
  blogVisitDays: number;
  /** そのうち、**同じ日に**道具のページも見た人日。 */
  toolVisitDays: number;
  /** toolVisitDays / blogVisitDays。分母が 0 なら null（0% と区別する）。 */
  rate: number | null;
};

/**
 * ブログ → 道具の到達率。
 *
 * visitor_hash は日付を混ぜてあり、**日をまたいで同じ人を追えない**。
 * だから「記事を読んで、後日また来て道具を使った」は原理的に測れない。
 * ここで出せるのは同じ日の中の併読だけで、実際の効果より低く出る。
 * 数字を読むときはこの偏りを込みで見ること。
 *
 * 分母は人数ではなく人日。同じ人が 3 日読めば 3 と数える。
 */
export function buildBlogFunnel(
  blogVisitDays: number,
  toolVisitDays: number,
): BlogFunnel {
  return {
    blogVisitDays,
    toolVisitDays,
    rate: blogVisitDays === 0 ? null : toolVisitDays / blogVisitDays,
  };
}
