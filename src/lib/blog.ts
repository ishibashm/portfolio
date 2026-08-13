import fs from "node:fs";
import path from "node:path";

const BLOG_DIRECTORY = path.join(process.cwd(), "content", "blog");
const FRONTMATTER_BOUNDARY = "---";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  category: string;
  tags: string[];
  draft: boolean;
  readingMinutes: number;
  body: string;
}

export type BlogPostSummary = Omit<BlogPost, "body">;

function parseFrontmatter(source: string, slug: string): BlogPost {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw new Error(`ブログ記事 ${slug} に frontmatter がありません。`);
  }

  const closing = normalized.indexOf(
    `\n${FRONTMATTER_BOUNDARY}\n`,
    FRONTMATTER_BOUNDARY.length + 1,
  );
  if (closing < 0) {
    throw new Error(`ブログ記事 ${slug} の frontmatter が閉じられていません。`);
  }

  const rawMetadata = normalized.slice(
    FRONTMATTER_BOUNDARY.length + 1,
    closing,
  );
  const body = normalized
    .slice(closing + FRONTMATTER_BOUNDARY.length + 2)
    .trim();
  const metadata = new Map<string, string>();

  for (const line of rawMetadata.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    metadata.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }

  const required = [
    "title",
    "description",
    "publishedAt",
    "category",
    "tags",
    "draft",
  ] as const;
  for (const key of required) {
    if (!metadata.get(key)) {
      throw new Error(`ブログ記事 ${slug} の ${key} が未設定です。`);
    }
  }

  const publishedAt = metadata.get("publishedAt")!;
  const updatedAt = metadata.get("updatedAt") || undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    throw new Error(
      `ブログ記事 ${slug} の publishedAt が YYYY-MM-DD ではありません。`,
    );
  }
  if (updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
    throw new Error(
      `ブログ記事 ${slug} の updatedAt が YYYY-MM-DD ではありません。`,
    );
  }
  const draftValue = metadata.get("draft")!;
  if (draftValue !== "true" && draftValue !== "false") {
    throw new Error(
      `ブログ記事 ${slug} の draft は true か false にしてください。`,
    );
  }

  const plainLength = body
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/[#*_`>|-]/g, "")
    .replace(/\s/g, "").length;

  return {
    slug,
    title: metadata.get("title")!,
    description: metadata.get("description")!,
    publishedAt,
    updatedAt,
    category: metadata.get("category")!,
    tags: metadata
      .get("tags")!
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    draft: draftValue === "true",
    readingMinutes: Math.max(1, Math.ceil(plainLength / 500)),
    body,
  };
}

function readBlogPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIRECTORY)) return [];

  return (
    fs
      .readdirSync(BLOG_DIRECTORY)
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const slug = file.slice(0, -3);
        const source = fs.readFileSync(path.join(BLOG_DIRECTORY, file), "utf8");
        return parseFrontmatter(source, slug);
      })
      .filter((post) => !post.draft)
      // 同じ日付の記事が2本以上あると、日付だけの比較では順序が決まらない。
      // Array#sort は安定なので readdirSync が返した順がそのまま残り、
      // 一覧・RSS・サイトマップの並びがファイルシステム依存になる。
      // slug で決着させて、どこで動かしても同じ並びにする。
      .sort(
        (a, b) =>
          b.publishedAt.localeCompare(a.publishedAt) ||
          a.slug.localeCompare(b.slug),
      )
  );
}

export function getBlogPosts(): BlogPostSummary[] {
  return readBlogPosts().map((post) => ({
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

export function getBlogPost(slug: string): BlogPost | undefined {
  return readBlogPosts().find((post) => post.slug === slug);
}

export function formatBlogDate(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
