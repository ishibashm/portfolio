/**
 * 記事の取り込み（scripts/import_blog_markdown.ts）で、DB に既にある
 * 記事と Markdown の中身の差を出す。**純粋な関数だけ。**
 *
 * ## なぜ要るか
 *
 * 上書き（overwrite）は、管理画面で直した記事をファイルの内容に戻す
 * 操作で、戻せない。以前の dry-run は「~ slug: 題」と上書きする旨を
 * 出すだけで、**何が変わるか**は出していなかった。公開済みの記事に
 * 段落を 1 つ足して反映したいとき、DB 側に管理画面の手直しが入って
 * いないかを確かめる手段が無かった（2026-09-30）。
 *
 * 本文は行の集合で比べる（順序は見ない）。知りたいのは「DB にだけある
 * 行＝上書きで消える行」が 0 かどうかで、それには集合で足りる。
 */

export interface ComparablePost {
  title: string;
  content: string;
  excerpt: string | null;
  category: string | null;
  tags: string;
  published: boolean;
  publishedAt: Date;
}

export interface BlogPostDiff {
  /** 本文以外で値が違う項目の名前 */
  changedFields: string[];
  /** DB にだけある本文の行（上書きで消える） */
  onlyInDb: string[];
  /** ファイルにだけある本文の行（上書きで入る） */
  onlyInFile: string[];
}

/** 空行と行末の空白は比べない（書き出しの揺れで差に見えるため） */
function lineSet(text: string): Set<string> {
  return new Set(
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l !== ""),
  );
}

export function diffBlogPost(
  db: ComparablePost,
  file: ComparablePost,
): BlogPostDiff {
  const changedFields: string[] = [];
  for (const key of [
    "title",
    "excerpt",
    "category",
    "tags",
    "published",
  ] as const) {
    if ((db[key] ?? null) !== (file[key] ?? null)) changedFields.push(key);
  }
  if (db.publishedAt.getTime() !== file.publishedAt.getTime()) {
    changedFields.push("publishedAt");
  }

  const dbLines = lineSet(db.content);
  const fileLines = lineSet(file.content);
  return {
    changedFields,
    onlyInDb: [...dbLines].filter((l) => !fileLines.has(l)),
    onlyInFile: [...fileLines].filter((l) => !dbLines.has(l)),
  };
}

/** ログ用。長い行は切る。各側 max 行まで */
export function formatBlogPostDiff(diff: BlogPostDiff, max = 20): string[] {
  const clip = (l: string) => (l.length > 120 ? `${l.slice(0, 120)}…` : l);
  const out: string[] = [];
  out.push(
    `      項目の差: ${diff.changedFields.length > 0 ? diff.changedFields.join(", ") : "なし"}`,
  );
  out.push(
    `      本文: DB にだけある行 ${diff.onlyInDb.length}（上書きで消える） / ファイルにだけある行 ${diff.onlyInFile.length}`,
  );
  for (const l of diff.onlyInDb.slice(0, max)) out.push(`      - ${clip(l)}`);
  for (const l of diff.onlyInFile.slice(0, max)) out.push(`      + ${clip(l)}`);
  return out;
}

/** frontmatter の日付（YYYY-MM-DD）。JST の 0 時として読む。 */
export function frontmatterInstant(date: string): Date {
  // UTC で解釈すると、日本時間の朝に公開した記事が前日付で並ぶ。
  return new Date(`${date}T00:00:00+09:00`);
}

/**
 * 取り込みで DB に書く更新日。**frontmatter の値をそのまま入れる。**
 *
 * `BlogPost.updatedAt` は Prisma の `@updatedAt` なので、値を渡さないと
 * **書き込んだ時刻**が入る。取り込みはこれを渡していなかったため、
 * 上書きで流すたびに、その日が全記事の更新日になっていた（2026-11-10 の
 * 棚卸しで、公開 78 本の dateModified がすべて 2026-11-09）。
 *
 * 記事ページの「更新」と JSON-LD の dateModified は DB のこの列から、
 * サイトマップの lastmod は frontmatter から出る。同じ記事の更新日が
 * 2 通りになり、しかも片方は「取り込みを流した日」で、本文が変わった日
 * ではなかった。lastmod を実際の更新日に直した理由（backlog 36 節。
 * 実際と合わない日付は読まれない）が、こちらには残っていた。
 *
 * updatedAt を省いた記事は公開日を入れる。表示側（blogStore）は
 * 公開日と同じ日なら「更新」を出さないので、Markdown から直に読んだ
 * ときと同じ見え方になる。
 */
export function importUpdatedAt(post: {
  publishedAt: string;
  updatedAt?: string;
}): Date {
  return frontmatterInstant(post.updatedAt ?? post.publishedAt);
}

/** 本文も項目も、DB とファイルで同じか。 */
export function isSameAsFile(diff: BlogPostDiff): boolean {
  return (
    diff.changedFields.length === 0 &&
    diff.onlyInDb.length === 0 &&
    diff.onlyInFile.length === 0
  );
}
