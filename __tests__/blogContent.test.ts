import { describe, expect, it } from "vitest";

import { getBlogPost, getBlogPosts } from "@/lib/blog";
import { GET as getBlogFeed } from "@/app/blog/feed.xml/route";

describe("ブログの公開記事", () => {
  it("公開中の2記事を新しい順で一覧に出す", () => {
    const posts = getBlogPosts();

    expect(posts.map((post) => post.slug)).toEqual([
      "tenchusatsu-and-lucky-directions",
      "does-a-lucky-move-cancel-an-unlucky-move",
    ]);
    expect(posts.every((post) => post.draft === false)).toBe(true);
    expect(posts.every((post) => post.readingMinutes > 0)).toBe(true);
  });

  it("記事URLから本文とSEO情報を取得できる", () => {
    const post = getBlogPost(
      "does-a-lucky-move-cancel-an-unlucky-move",
    );

    expect(post?.title).toContain("75日後");
    expect(post?.description).toContain("相殺");
    expect(post?.body).toContain("次の移動をどこから測るか");
  });

  it("存在しない記事URLは見つからない", () => {
    expect(getBlogPost("not-found")).toBeUndefined();
  });

  it("公開記事をRSSでも購読できる", async () => {
    const response = getBlogFeed();
    const xml = await response.text();

    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain(
      "https://cloud-palette.com/blog/tenchusatsu-and-lucky-directions",
    );
    expect(xml.match(/<item>/g)).toHaveLength(2);
  });
});
