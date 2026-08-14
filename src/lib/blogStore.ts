import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { toJapanDateString } from "@/utils/japanDate";
import {
  getBlogPost as getMarkdownBlogPost,
  getBlogPosts as getMarkdownBlogPosts,
  readingMinutesOf,
  type BlogPost,
  type BlogPostSummary,
} from "@/lib/blog";

/**
 * 記事の取得口。**DB を先に見て、無ければ Markdown に落ちる。**
 *
 * 置き場を content/blog/*.md から DB（BlogPost）へ移している途中なので、
 * 2 つの状態が同時に存在する。
 *
 *   取り込み前   DB は空 → Markdown が出る（これまでどおり）
 *   取り込み後   DB に入っている → DB が出る
 *
 * 落とし方をこうしたのは、**取り込みを流す前にコードが本番へ出ても
 * /blog が空にならないため。**先にスキーマを当てて取り込みを流し、それから
 * デプロイ、という順序を守らせる作りにすると、順序を間違えた瞬間に記事が
 * 全部消える。落ちる先があれば、順序はどちらでもよくなる。
 *
 * DB が読めない（接続できない・表がまだ無い）ときも Markdown に落ちる。
 * 記事は公開ページなので、DB の不調で 500 にする理由が無い。ビルド時の
 * 事前生成でも同じ経路を通るため、ビルドが DB の生死に依存しなくなる。
 *
 * **判定は「0 件かどうか」で見る。**「表があるか」を調べる問い合わせを
 * 足すと、記事を読むたびに往復が 1 つ増える。
 */

/** DB の 1 行を、Markdown 由来のものと同じ形にする。 */
function toBlogPost(row: {
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  category: string | null;
  publishedAt: Date;
  updatedAt: Date;
  tags: string;
  published: boolean;
}): BlogPost {
  // 日付は JST の暦で見る。UTC のまま切ると、日本時間の朝に公開した
  // 記事が前日付で並ぶ。
  const publishedAt = toJapanDateString(row.publishedAt);
  const updatedAt = toJapanDateString(row.updatedAt);

  return {
    slug: row.slug,
    title: row.title,
    description: row.excerpt ?? "",
    publishedAt,
    // 公開日と同じ日なら「更新」を出さない。Markdown 側の frontmatter で
    // updatedAt を省いたときと同じ見え方にする。
    updatedAt: updatedAt === publishedAt ? undefined : updatedAt,
    category: row.category ?? "その他",
    tags: row.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    draft: !row.published,
    // 数え方は Markdown 側と同じ関数を使う。2 通りになると、同じ記事なのに
    // 置き場によって「約3分」と「約4分」が入れ替わる。
    readingMinutes: readingMinutesOf(row.content),
    body: row.content,
  };
}

const ROW_FIELDS = {
  slug: true,
  title: true,
  content: true,
  excerpt: true,
  category: true,
  publishedAt: true,
  updatedAt: true,
  tags: true,
  published: true,
} as const;

/** 公開中の記事を新しい順で。DB が空か読めなければ Markdown。 */
export async function loadBlogPosts(): Promise<BlogPostSummary[]> {
  const posts = await loadAll();
  // 一覧に本文は載せない。分割代入で捨てると未使用の変数が残るので、
  // 出す項目を並べる。
  return posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    category: post.category,
    tags: post.tags,
    draft: post.draft,
    readingMinutes: post.readingMinutes,
  }));
}

/** 1 本ぶん。本文つき。 */
export async function loadBlogPost(
  slug: string,
): Promise<BlogPost | undefined> {
  try {
    const row = await prisma.blogPost.findFirst({
      where: { slug, published: true },
      select: ROW_FIELDS,
    });
    if (row) return toBlogPost(row);
  } catch (e) {
    console.warn("記事の取得に失敗。Markdown に落ちる:", toLogMessage(e));
  }
  return getMarkdownBlogPost(slug);
}

async function loadAll(): Promise<BlogPost[]> {
  try {
    const rows = await prisma.blogPost.findMany({
      where: { published: true },
      select: ROW_FIELDS,
      // 同じ日付の記事が並んだときに順序が決まらないと、一覧・RSS・
      // サイトマップの並びが実行のたびに変わりうる。slug で決着させる
      // （Markdown 側と同じ規則）。
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
    });
    if (rows.length > 0) return rows.map(toBlogPost);
  } catch (e) {
    console.warn("記事一覧の取得に失敗。Markdown に落ちる:", toLogMessage(e));
  }

  // DB が空＝まだ取り込んでいない。Markdown をそのまま出す。
  return getMarkdownBlogPosts().map((summary) => ({
    ...summary,
    body: getMarkdownBlogPost(summary.slug)?.body ?? "",
  }));
}
