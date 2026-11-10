import prisma from "@/lib/prisma";
import { blogCardVideoId } from "./blogVideo";
import { errorCode, toLogMessage } from "@/lib/errorMessage";
import { toJapanDateString } from "@/utils/japanDate";
import { isAgentLogSlug } from "@/lib/agentLog";
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
 * 接続障害で DB 専用記事を「無い」と返すと、ISR が 404 を控えてしまう。
 * Markdown にある記事だけ補い、一覧は再生成を失敗させて正常な控えを守る。
 * 初回ビルドは正常な控えがまだ無いため、DB 障害でも Markdown に落ちる。
 * 表がまだ無い場合なども、取り込み前の Markdown フォールバックを残す。
 *
 * **判定は「0 件かどうか」で見る。**「表があるか」を調べる問い合わせを
 * 足すと、記事を読むたびに往復が 1 つ増える。
 */

/** 接続・待ち時間の失敗だけを分け、スキーマ未適用は従来どおり扱う。 */
function isTemporaryDatabaseError(error: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  const code = errorCode(error);
  if (
    code &&
    /^(P1001|P1002|P1008|P1017|P2024|P2037|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|08000|08001|08003|08006|57P01|57P02|57P03|53300|57014)$/.test(
      code,
    )
  )
    return true;
  if (
    /connection (?:refused|terminated|closed|timeout)|connect(?:ion)? timed out|timeout exceeded when trying to connect|can't reach database server|timed out fetching a new connection|DatabaseNotReachable|SocketTimeout/i.test(
      toLogMessage(error),
    )
  )
    return true;
  // pg アダプターは接続エラーを cause / meta に包むことがある。
  if (typeof error !== "object" || error === null) return false;
  if (
    "kind" in error &&
    /^(DatabaseNotReachable|SocketTimeout|ConnectionClosed|TooManyConnections)$/.test(
      String(error.kind),
    )
  )
    return true;
  return ["cause", "meta", "driverAdapterError"].some(
    (key) =>
      key in error &&
      isTemporaryDatabaseError(Reflect.get(error, key), depth + 1),
  );
}

/** Next が静的生成ワーカーの起動前に設定する値。実行時の ISR では未設定。 */
function shouldPreserveIsrCache(error: unknown): boolean {
  return (
    process.env.NEXT_PHASE !== "phase-production-build" &&
    isTemporaryDatabaseError(error)
  );
}

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

/**
 * 動画の項目は DB に列が無い。取り込みで落ちるので、同じ slug の
 * Markdown frontmatter から補う（無ければそのまま）。
 */
function withMarkdownVideo(
  post: BlogPost,
  md: BlogPostSummary | undefined = getMarkdownBlogPost(post.slug),
): BlogPost {
  if (!md?.youtubeId) return post;
  return {
    ...post,
    youtubeId: md.youtubeId,
    videoUploadDate: md.videoUploadDate,
    videoDuration: md.videoDuration,
    videoTitle: md.videoTitle,
    videoDescription: md.videoDescription,
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

/** 公開中の記事を新しい順で。DB が空・スキーマ未適用なら Markdown。 */
export async function loadBlogPosts(
  options: { quiet?: boolean } = {},
): Promise<BlogPostSummary[]> {
  const posts = await loadSearchableBlogPosts(options);
  // 一覧に本文は載せない。分割代入で捨てると未使用の変数が残るので、
  // 出す項目を並べる。
  return posts.map((post) => ({
    youtubeId: blogCardVideoId(post),
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
  options: { quiet?: boolean } = {},
): Promise<BlogPost | undefined> {
  /*
    作業ログ（slug が agent-）。published が true の既存行も出さない。
    行の更新・削除はしない。今後の書き込みは daemon が published: false
    にするが、既に公開済みの行はこちらのふるいが閉じる。
  */
  if (isAgentLogSlug(slug)) return undefined;
  try {
    const row = await prisma.blogPost.findFirst({
      where: { slug },
      select: ROW_FIELDS,
    });
    /*
      **非公開にした記事を Markdown で出さない。**以前は published: true で
      引いて、無ければ Markdown に落ちていた。取り込んだ 28 本は
      content/blog にも残っている（Dockerfile が image に入れる）ので、
      管理画面で非公開にしても、消しても、記事 URL はそのまま開けた
      （一覧と RSS からだけ消えていた）。

      行があって非公開なら 404。行が無くても DB に記事が 1 本でもあれば
      DB を正として 404（消した記事を Markdown で復活させない）。
      DB が空なら Markdown。接続障害時は下で記事の有無を確かめる。
    */
    if (row)
      return row.published ? withMarkdownVideo(toBlogPost(row)) : undefined;
    const seeded = await prisma.blogPost.findFirst({ select: { slug: true } });
    if (seeded) return undefined;
  } catch (e) {
    const markdown = getMarkdownBlogPost(slug);
    if (shouldPreserveIsrCache(e) && !markdown) throw e;
    if (!options.quiet)
      console.warn("記事の取得に失敗。Markdown に落ちる:", toLogMessage(e));
    return markdown;
  }
  return getMarkdownBlogPost(slug);
}

export async function loadSearchableBlogPosts(options: {
  quiet?: boolean;
}): Promise<BlogPost[]> {
  try {
    const rows = await prisma.blogPost.findMany({
      where: { published: true },
      select: ROW_FIELDS,
      // 同じ日付の記事が並んだときに順序が決まらないと、一覧・RSS・
      // サイトマップの並びが実行のたびに変わりうる。slug で決着させる
      // （Markdown 側と同じ規則）。
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
    });
    if (rows.length > 0) {
      const videos = new Map(
        getMarkdownBlogPosts().map((post) => [post.slug, post]),
      );
      return rows
        .filter((row) => !isAgentLogSlug(row.slug))
        .map((row) => {
          const post = toBlogPost(row);
          const md = videos.get(row.slug);
          return md ? withMarkdownVideo(post, md) : post;
        });
    }
    if (await prisma.blogPost.findFirst({ select: { slug: true } })) return [];
  } catch (e) {
    // 実行時は一覧の一部だけを正常な結果として控えない。初回ビルドは Markdown。
    if (shouldPreserveIsrCache(e)) throw e;
    if (!options.quiet)
      console.warn("記事一覧の取得に失敗。Markdown に落ちる:", toLogMessage(e));
  }

  // DB が空＝まだ取り込んでいない。Markdown をそのまま出す。
  return getMarkdownBlogPosts()
    .filter((summary) => !isAgentLogSlug(summary.slug))
    .map((summary) => ({
      ...summary,
      body: getMarkdownBlogPost(summary.slug)?.body ?? "",
    }));
}
