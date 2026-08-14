import { describe, expect, it } from "vitest";

import { getBlogPost, getBlogPosts } from "@/lib/blog";
import { GET as getBlogFeed } from "@/app/blog/feed.xml/route";

describe("ブログの公開記事", () => {
  // 記事は増える。**本数を数字で固定しない。**以前は 3 本を列挙していて、
  // 記事を足すたびにここが落ちた。落ちても分かるのは「増えた」だけで、
  // 並びが壊れたのかどうかは読み取れない。守りたいのは順序の規則なので、
  // 規則そのものを検査する。
  it("公開記事を新しい順・同日はslugの昇順で並べる", () => {
    const posts = getBlogPosts();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.draft === false)).toBe(true);
    expect(posts.every((post) => post.readingMinutes > 0)).toBe(true);

    const sorted = [...posts].sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );
    expect(posts.map((post) => post.slug)).toEqual(
      sorted.map((post) => post.slug),
    );
  });

  // 同じ日付の記事が 2 本以上あると、日付だけの比較では順序が決まらない。
  // slug で決着させていないと、一覧・RSS・サイトマップの並びが実行環境の
  // readdir 依存になる。同日が実際に存在することも併せて確かめる。
  it("同じ公開日の記事はslugの昇順で並ぶ", () => {
    const posts = getBlogPosts();
    const sameDay = posts.filter((post) => post.publishedAt === "2026-08-14");

    expect(sameDay.length).toBeGreaterThan(1);
    expect(sameDay.map((post) => post.slug)).toEqual(
      [...sameDay.map((post) => post.slug)].sort(),
    );
  });

  // slug は URL そのもの。重複や大文字が混ざると 404 や重複コンテンツになる。
  it("slugは重複せず、URLに使える文字だけでできている", () => {
    const slugs = getBlogPosts().map((post) => post.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug))).toBe(true);
  });

  // 記事どうしのリンクは手で書くので、綴りを間違えると 404 になる。
  // 公開前に気付けるよう、リンク先が実在することを検査する。
  it("記事内の/blog/リンクはすべて実在する記事を指す", () => {
    const posts = getBlogPosts();
    const slugs = new Set(posts.map((post) => post.slug));
    const missing: string[] = [];

    for (const summary of posts) {
      const body = getBlogPost(summary.slug)?.body ?? "";
      for (const match of body.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)) {
        if (!slugs.has(match[1])) missing.push(`${summary.slug} -> ${match[1]}`);
      }
    }

    expect(missing).toEqual([]);
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
    // 本数は固定しない（記事は増える）。Markdown 側の公開本数と一致することだけ見る。
    expect(xml.match(/<item>/g)).toHaveLength(getBlogPosts().length);
  });
});
