/**
 * 投稿欄は記事だけに置く（利用者の指示）。
 *
 * 鍵の形は `lib/comments` が持ち、**実在の確認は API 側**で行う。
 * 分けているのは、記事の一覧が DB から来る非同期の処理で、
 * `lib/comments` は投稿欄（client component）から import されるため。
 * 引き込むと記事の読み込みごとクライアントのバンドルに乗る
 * （#177〜#179 で重い依存を遅延させたのと同じ穴）。
 *
 * 形だけ通して実在を見ないと `blog:anything` で好きなだけ話題を作れる。
 * **両方あって初めて塞がる**ので、両方をここで固定する。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { blogTopic, isValidTopicKey } from "@/lib/comments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("記事の鍵", () => {
  it("slug から機械的に作る", () => {
    expect(blogTopic("how-much-does-distance-matter")).toBe(
      "blog:how-much-does-distance-matter",
    );
  });

  it("形が合っていれば通る", () => {
    expect(isValidTopicKey(blogTopic("year-board-blocks-a-whole-year"))).toBe(
      true,
    );
  });

  it("形が違うものは通さない", () => {
    // 大文字・記号・スラッシュ・短すぎるものを弾く。弾かないと
    // 同じ記事に対して複数の鍵ができ、投稿が分散する。
    for (const bad of [
      "blog:",
      "blog:ab",
      "blog:UPPER",
      "blog:with space",
      "blog:with/slash",
      "blog:-leading-hyphen",
      "blog:" + "x".repeat(81),
    ]) {
      expect(isValidTopicKey(bad), bad).toBe(false);
    }
  });

  it("実在の確認は lib/comments では**しない**", () => {
    // ここで記事を読みに行くと、投稿欄が client component なので
    // 記事の読み込みごとバンドルに乗る。import が増えていないことを見る。
    // 経緯を書いたコメントに語が出るので、import の形で見る。
    const src = read("src/lib/comments.ts");
    expect(src).not.toMatch(/^import .*blogStore/m);
    expect(src).not.toMatch(/^import .*loadBlogPost/m);
  });
});

describe("実在の確認は API 側にある", () => {
  const api = read("src/app/api/comments/route.ts");

  it("記事の鍵は loadBlogPost で実在を見る", () => {
    expect(api).toContain("loadBlogPost");
    expect(api).toContain("topicExists");
  });

  it("読み取りと投稿の両方で見る", () => {
    // 片方だけだと、投稿できない鍵の一覧が読めてしまう／
    // 読めない鍵に積めてしまう。
    const calls = api.match(/topicExists\(/g) ?? [];
    // 定義 1 + GET 1 + POST 1
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("記事の頁に投稿欄がある", () => {
  const page = read("src/app/blog/[slug]/page.tsx");

  it("blogTopic で鍵を作って渡している", () => {
    expect(page).toContain("blogTopic(post.slug)");
    expect(page).toContain("DirectionComments");
  });

  it("文字列を組み立てて渡していない", () => {
    // 表記ゆれで別の記事の投稿になるのを防ぐ。
    expect(page).not.toContain("`blog:${");
  });
});
