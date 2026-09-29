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
