import { PrismaClient } from "@prisma/client";
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
 *   npx -y tsx scripts/import_blog_markdown.ts              # 入っていないものだけ
 *   IMPORT_OVERWRITE=true npx -y tsx scripts/import_blog_markdown.ts
 *   IMPORT_DRY_RUN=true npx -y tsx scripts/import_blog_markdown.ts   # 何もしない
 *
 * 取り込んだあとも Markdown のファイルは消さない。DB が空のときは
 * ファイルに落ちる読み方（次の PR）にしてあるので、消すのは移行が
 * 落ち着いてから別途決める。
 */

const prisma = new PrismaClient();

const OVERWRITE = process.env.IMPORT_OVERWRITE === "true";
const DRY_RUN = process.env.IMPORT_DRY_RUN === "true";

async function main() {
  const summaries = getBlogPosts();
  console.log(`Markdown の公開記事: ${summaries.length} 本`);
  console.log(
    `モード: ${DRY_RUN ? "DRY RUN（書き込まない）" : OVERWRITE ? "APPLY（既存も上書き）" : "APPLY（入っていないものだけ）"}`,
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
