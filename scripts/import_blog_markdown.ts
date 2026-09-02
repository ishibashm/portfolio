import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { getBlogPost, getBlogPosts } from "../src/lib/blog";

/**
 * content/blog/*.md を BlogPost へ取り込む。
 *
 * 記事の置き場を Markdown ファイルから DB へ移すための、一度きりの橋。
 * 読み取りは既存の src/lib/blog をそのまま使う。ここで frontmatter を
 * 読み直すと、必須項目の検査や readingMinutes の数え方が 2 通りになる。
 *
 * **slug で upsert する。**何度流しても同じ結果になるようにしてある。
 * 取り込みが途中で落ちたときに、どこまで入ったかを調べてから流し直す、
 * という手順を踏まずに済む。
 *
 * 既に DB 側で編集した記事を、ファイルの内容で上書きしてよいかは
 * 場合による。既定では**上書きしない**（slug が同じ行があれば飛ばす）。
 * 上書きしたいときだけ IMPORT_OVERWRITE=true を付ける。
 *
 * **上書きは全記事に及ぶ。**公開済みの記事を 1 本直したいだけでも、
 * 管理画面で手を入れた別の記事までファイルの内容に戻る。実際に必要なのは
 * 「この slug だけ」であることが多いので、IMPORT_ONLY で対象を絞れる
 * ようにしてある（カンマ区切り）。指定した slug が Markdown に無ければ
 * 何も書き込まずに落とす（打ち間違いに気付かず「0 件でした」で終わる
 * のを防ぐ）。
 *
 *   npx -y tsx scripts/import_blog_markdown.ts              # 入っていないものだけ
 *   IMPORT_OVERWRITE=true npx -y tsx scripts/import_blog_markdown.ts
 *   IMPORT_ONLY=my-slug IMPORT_OVERWRITE=true npx -y tsx scripts/import_blog_markdown.ts
 *   IMPORT_DRY_RUN=true npx -y tsx scripts/import_blog_markdown.ts   # 何もしない
 *
 * 取り込んだあとも Markdown のファイルは消さない。DB が空のときは
 * ファイルに落ちる読み方（次の PR）にしてあるので、消すのは移行が
 * 落ち着いてから別途決める。
 */

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 接続は pg のアダプタ経由で作る。
 *
 * Prisma 7 では `new PrismaClient()` を引数なしでは作れず、
 * PrismaClientInitializationError で落ちる。このリポジトリの他の
 * スクリプト（count_prefectures / import_land_prices など）と
 * src/lib/prisma.ts はすべてアダプタを渡している。
 *
 * ここは manage_blog.ts の書き方を写して引数なしにしてしまい、実際に
 * 本番の Actions で落とした。**manage_blog.ts / list_posts.ts /
 * delete_dummy.ts は同じ理由で今も動かない。**どれも実行されていない
 * ので表に出ていないだけで、直すなら別途。
 */
const pool = new Pool({
  // 書き込むのでプーラ経由でない DIRECT_URL を優先する。
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 1,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OVERWRITE = process.env.IMPORT_OVERWRITE === "true";
const DRY_RUN = process.env.IMPORT_DRY_RUN === "true";
const ONLY = (process.env.IMPORT_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function main() {
  const all = getBlogPosts();
  console.log(`Markdown の公開記事: ${all.length} 本`);

  if (ONLY.length > 0) {
    // 指定した slug が 1 つでも無ければ止める。存在しない slug を
    // 黙って読み飛ばすと「対象 0 本、成功」で終わり、直したつもりの
    // 記事が本番に出ないまま気付けない。
    const known = new Set(all.map((s) => s.slug));
    const missing = ONLY.filter((slug) => !known.has(slug));
    if (missing.length > 0) {
      throw new Error(
        `IMPORT_ONLY に Markdown へ無い slug がある: ${missing.join(", ")}`,
      );
    }
  }

  const summaries =
    ONLY.length > 0 ? all.filter((s) => ONLY.includes(s.slug)) : all;
  console.log(
    `モード: ${DRY_RUN ? "DRY RUN（書き込まない）" : OVERWRITE ? "APPLY（既存も上書き）" : "APPLY（入っていないものだけ）"}` +
      (ONLY.length > 0 ? ` / 対象を ${summaries.length} 本に絞る` : ""),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const summary of summaries) {
    // 本文は一覧の型（BlogPostSummary）に入っていないので取り直す。
    const post = getBlogPost(summary.slug);
    if (!post) {
      console.warn(`  ! ${summary.slug}: 本文を読めなかった。飛ばす`);
      continue;
    }

    const existing = await prisma.blogPost.findUnique({
      where: { slug: post.slug },
      select: { id: true },
    });

    if (existing && !OVERWRITE) {
      console.log(`  = ${post.slug}: 既にある。飛ばす`);
      skipped++;
      continue;
    }

    const data = {
      title: post.title,
      content: post.body,
      excerpt: post.description,
      category: post.category,
      // frontmatter は日付だけ。JST の 0 時として入れる。UTC で解釈すると
      // 日本時間の朝に公開した記事が前日付で並ぶ。
      publishedAt: new Date(`${post.publishedAt}T00:00:00+09:00`),
      tags: post.tags.join(","),
      published: !post.draft,
    };

    if (DRY_RUN) {
      console.log(`  ${existing ? "~" : "+"} ${post.slug}: ${post.title}`);
      if (existing) updated++;
      else created++;
      continue;
    }

    if (existing) {
      await prisma.blogPost.update({ where: { slug: post.slug }, data });
      console.log(`  ~ ${post.slug}: 上書き`);
      updated++;
    } else {
      await prisma.blogPost.create({ data: { ...data, slug: post.slug } });
      console.log(`  + ${post.slug}: 追加`);
      created++;
    }
  }

  console.log(`\n追加 ${created} / 上書き ${updated} / 飛ばした ${skipped}`);

  const total = await prisma.blogPost.count();
  const publishedCount = await prisma.blogPost.count({
    where: { published: true },
  });
  console.log(`DB の記事: ${total} 本（うち公開 ${publishedCount} 本）`);
}

main()
  .catch((e) => {
    console.error(e);
    // いちばん多い失敗が「スキーマをまだ当てていない」。Prisma の
    // 生のエラーだけだと、何をすればよいのか読み取れない。
    const message = e instanceof Error ? e.message : String(e);
    if (/does not exist|Unknown argument|column/i.test(message)) {
      console.error(
        "\nヒント: BlogPost の列がまだ当たっていない可能性があります。" +
          "\n先に GitHub Actions の " +
          '"Setup Database Schema and Seed Data" を実行してください。',
      );
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
