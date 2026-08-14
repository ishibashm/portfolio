import { describe, expect, it } from "vitest";

import { getBlogPost, getBlogPosts } from "@/lib/blog";
import { GET as getBlogFeed } from "@/app/blog/feed.xml/route";

describe("ブログの公開記事", () => {
  it("公開中の3記事を新しい順で一覧に出す", () => {
    const posts = getBlogPosts();

    expect(posts.map((post) => post.slug)).toEqual([
      "direction-seen-from-the-original-home",
      "tenchusatsu-and-lucky-directions",
      "does-a-lucky-move-cancel-an-unlucky-move",
    ]);
    expect(posts.every((post) => post.draft === false)).toBe(true);
    expect(posts.every((post) => post.readingMinutes > 0)).toBe(true);
  });

  // 上の並びは日付だけでは決まらない（2記事が 2026-08-14 で同じ）。
  // 日付が同じときは slug の昇順で決着させている。ここが崩れると
  // 一覧・RSS・サイトマップの並びが実行環境の readdir 依存になる。
  it("同じ公開日の記事はslugの昇順で並ぶ", () => {
    const posts = getBlogPosts();
    const sameDay = posts.filter((post) => post.publishedAt === "2026-08-14");

    expect(sameDay.map((post) => post.slug)).toEqual([
      "direction-seen-from-the-original-home",
      "tenchusatsu-and-lucky-directions",
    ]);
  });

  it("記事URLから本文とSEO情報を取得できる", () => {
    const post = getBlogPost("does-a-lucky-move-cancel-an-unlucky-move");

    expect(post?.title).toContain("75日後");
    expect(post?.description).toContain("相殺");
    expect(post?.body).toContain("次の移動をどこから測るか");
  });

  it("存在しない記事URLは見つからない", () => {
    expect(getBlogPost("not-found")).toBeUndefined();
  });

  // RSS は DB を先に見るようになった（lib/blogStore）。このテストは
  // DB を用意していないので Markdown に落ちる経路を通る。落ちる先が
  // 壊れると、ここが先に落ちる。
  it("公開記事をRSSでも購読できる", async () => {
    const response = await getBlogFeed();
    const xml = await response.text();

    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain(
      "https://cloud-palette.com/blog/tenchusatsu-and-lucky-directions",
    );
    expect(xml.match(/<item>/g)).toHaveLength(3);
  });
});
