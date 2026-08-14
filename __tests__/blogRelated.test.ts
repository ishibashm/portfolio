import { describe, expect, it } from "vitest";

import { pickRelatedPosts, RELATED_LIMIT } from "@/lib/blogRelated";
import { getBlogPosts } from "@/lib/blog";
import type { BlogPostSummary } from "@/lib/blog";

function post(
  slug: string,
  category: string,
  tags: string[],
  publishedAt = "2026-08-15",
): BlogPostSummary {
  return {
    slug,
    title: slug,
    description: "",
    publishedAt,
    category,
    tags,
    draft: false,
    readingMinutes: 1,
  };
}

describe("あわせて読む記事の選び方", () => {
  const current = post("current", "方位の読み方", ["九星気学", "凶方位"]);

  it("同じカテゴリと共通タグが多いものを先に出す", () => {
    const candidates = [
      post("no-match", "データの見方", ["賃貸"]),
      post("one-tag", "暦とタイミング", ["凶方位"]),
      post("category-only", "方位の読み方", ["相場"]),
      post("both", "方位の読み方", ["九星気学", "凶方位"]),
    ];

    // both=3（カテゴリ2＋タグ1）> category-only=2 > one-tag=1 > no-match=0。
    expect(
      pickRelatedPosts(current, candidates).map((item) => item.slug),
    ).toEqual(["both", "category-only", "one-tag", "no-match"]);
  });

  // タグ「九星気学」は実測で 23 本中 17 本に付いていた。ほぼ全記事が
  // 共有しているものを数えると、どの記事から見ても同じ顔ぶれが出る。
  it("半分を超える記事に付いたタグは数えない", () => {
    const candidates = [
      // 5 本中 4 本が「九星気学」を持つ = ありふれたタグ。
      post("common-tag-only", "暦とタイミング", ["九星気学"]),
      post("filler-a", "データの見方", ["九星気学"], "2026-08-10"),
      post("filler-b", "データの見方", ["九星気学"], "2026-08-09"),
      post("rare-tag", "データの見方", ["凶方位"]),
    ];

    // 「九星気学」を数えれば common-tag-only が 1 点で先頭に来るはず。
    // 数えないので、珍しいタグを共有する rare-tag が先。
    expect(pickRelatedPosts(current, candidates)[0].slug).toBe("rare-tag");
  });

  it("自分自身は出さない", () => {
    const candidates = [current, post("other", "方位の読み方", [])];

    expect(
      pickRelatedPosts(current, candidates).map((item) => item.slug),
    ).toEqual(["other"]);
  });

  it("上限を超えない", () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      post(`p${String(i).padStart(2, "0")}`, "方位の読み方", ["九星気学"]),
    );

    expect(pickRelatedPosts(current, candidates)).toHaveLength(RELATED_LIMIT);
    expect(pickRelatedPosts(current, candidates, 2)).toHaveLength(2);
    expect(pickRelatedPosts(current, candidates, 0)).toEqual([]);
  });

  // 関連が 1 件も無くても脇を空にしない。空だと「記事はこれで終わり」に
  // 見える。埋める分も上限は超えない。
  it("関連が無ければ新しい記事で埋める", () => {
    const candidates = [
      post("old", "データの見方", [], "2026-01-01"),
      post("new", "データの見方", [], "2026-08-01"),
    ];

    expect(
      pickRelatedPosts(current, candidates).map((item) => item.slug),
    ).toEqual(["new", "old"]);
  });

  // 同点が並んだときに配列の並び順で結果が変わると、ISR の再生成のたびに
  // 脇の顔ぶれが入れ替わる。一覧・RSS と同じく slug まで見て決着させる。
  it("同点は公開日の降順、それも同じなら slug の昇順で決まる", () => {
    const candidates = [
      post("zebra", "方位の読み方", ["九星気学"]),
      post("apple", "方位の読み方", ["九星気学"]),
      post("melon", "方位の読み方", ["九星気学"], "2026-08-20"),
    ];

    expect(
      pickRelatedPosts(current, candidates).map((item) => item.slug),
    ).toEqual(["melon", "apple", "zebra"]);
    expect(
      pickRelatedPosts(current, [...candidates].reverse()).map(
        (item) => item.slug,
      ),
    ).toEqual(["melon", "apple", "zebra"]);
  });

  // 旧実装は「自分以外の全記事」だった。記事が増えるほど脇が伸びる。
  // その挙動に戻すとこのテストが落ちる。
  it("実際の記事でも脇に全記事を並べない", () => {
    const posts = getBlogPosts();
    expect(posts.length).toBeGreaterThan(RELATED_LIMIT + 1);

    const related = pickRelatedPosts(posts[0], posts);

    expect(related).toHaveLength(RELATED_LIMIT);
    expect(related.length).toBeLessThan(posts.length - 1);
  });
});
