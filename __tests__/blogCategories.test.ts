import { describe, expect, it } from "vitest";

import { groupPostsByCategory } from "@/lib/blogCategories";
import { getBlogPosts } from "@/lib/blog";
import type { BlogPostSummary } from "@/lib/blog";

function post(
  slug: string,
  category: string,
  publishedAt = "2026-08-15",
): BlogPostSummary {
  return {
    slug,
    title: slug,
    description: "",
    publishedAt,
    category,
    tags: [],
    draft: false,
    readingMinutes: 1,
  };
}

describe("記事一覧のカテゴリ分け", () => {
  it("記事数の多い順、同数なら名前順で節を並べる", () => {
    const groups = groupPostsByCategory([
      post("a", "暦とタイミング"),
      post("b", "方位の読み方"),
      post("c", "方位の読み方"),
      post("d", "データの見方"),
      post("e", "暦とタイミング"),
      post("f", "方位の読み方"),
    ]);

    expect(groups.map((g) => [g.category, g.posts.length])).toEqual([
      ["方位の読み方", 3],
      ["暦とタイミング", 2],
      ["データの見方", 1],
    ]);
  });

  // 節の中は渡された並び（一覧は新しい順）をそのまま保つ。ここで並べ直すと
  // 一覧・RSS・サイトマップと順序の決め方が 2 通りになる。
  it("節の中の並びは渡された順のまま", () => {
    const groups = groupPostsByCategory([
      post("new", "方位の読み方", "2026-08-15"),
      post("mid", "方位の読み方", "2026-08-10"),
      post("old", "方位の読み方", "2026-08-01"),
    ]);

    expect(groups[0].posts.map((p) => p.slug)).toEqual(["new", "mid", "old"]);
  });

  // 同数のときに実行環境の照合順に依存すると、走らせる場所で節の並びが
  // 変わる。localeCompare を使わずコード単位で比べているのはそのため。
  it("同数の節の並びは入力の順に左右されない", () => {
    const input = [post("a", "あ"), post("b", "い"), post("c", "う")];
    const forward = groupPostsByCategory(input).map((g) => g.category);
    const backward = groupPostsByCategory([...input].reverse()).map(
      (g) => g.category,
    );

    expect(forward).toEqual(backward);
  });

  // id は日本語のカテゴリ名から作る。作り方が雑だと別の名前が同じ id に
  // つぶれ、目次のリンクが同じ節へ飛ぶ。**名前の違う節を自前で並べて見る。**
  // 以前は実際の記事から作り、節が 2 つ以上あることを求めていた。記事の
  // カテゴリが 1 種類になると落ちるが、それは id の作り方の話ではない。
  it("アンカーidは節ごとに違う値になる", () => {
    const ids = groupPostsByCategory([
      post("a", "方位の読み方"),
      post("b", "暦とタイミング"),
      post("c", "データの見方"),
      post("d", "引越しの考え方"),
    ]).map((g) => g.id);

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0 && !/\s/.test(id))).toBe(true);
  });

  // 実際の記事から作った id も、空白を含まずリンクに使える形であること。
  // 節がいくつになるかは記事しだいなので数えない。
  it("実際の記事から作ったidもリンクに使える", () => {
    const groups = groupPostsByCategory(getBlogPosts());

    expect(groups.length).toBeGreaterThan(0);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    expect(groups.every((g) => g.id.length > 0 && !/\s/.test(g.id))).toBe(true);
  });

  it("記事を1本も落とさない", () => {
    const posts = getBlogPosts();
    const grouped = groupPostsByCategory(posts).flatMap((g) => g.posts);

    expect(grouped).toHaveLength(posts.length);
    expect(new Set(grouped.map((p) => p.slug)).size).toBe(posts.length);
  });

  it("記事が無ければ節も無い", () => {
    expect(groupPostsByCategory([])).toEqual([]);
  });
});
