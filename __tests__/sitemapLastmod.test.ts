import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import path from "path";
import { getBlogPosts } from "@/lib/blog";

/**
 * サイトマップの lastmod が、本当に変わった日だけを名乗ること。
 *
 * 以前は next-sitemap の既定（autoLastmod）で、**ビルド時刻が全 URL に
 * 入っていた。**master へのマージ＝デプロイなので、ほぼ毎日、全頁が
 * 「今日更新」を名乗る。Google は実際の更新と合わない lastmod を読まない。
 * Search Console（2026-10-02）では「検出 - インデックス未登録」が 361 件
 * あり、どれから読みに来るかの手がかりを自分で潰していた。
 *
 * 設定の transform を直接呼んで、出る値を見る。
 */

const require_ = createRequire(import.meta.url);
const config = require_(path.resolve(process.cwd(), "next-sitemap.config.js"));

const transform = (loc: string) => config.transform(config, loc);

describe("サイトマップの lastmod", () => {
  it("ビルド時刻を全 URL に入れない（autoLastmod を切っている）", async () => {
    expect(config.autoLastmod).toBe(false);
    // 日付を持たない頁には lastmod を書かない
    for (const loc of ["/", "/houi", "/calendar", "/houi/area/13101"]) {
      expect((await transform(loc)).lastmod, loc).toBeUndefined();
    }
  });

  const posts = getBlogPosts();

  it.each(posts.map((p) => [p.slug, p.updatedAt ?? p.publishedAt] as const))(
    "/blog/%s は記事の更新日（無ければ公開日）",
    async (slug, want) => {
      expect((await transform(`/blog/${slug}`)).lastmod).toBe(want);
    },
  );

  it("/blog は記事の中で最も新しい日", async () => {
    const latest = posts
      .map((p) => p.updatedAt ?? p.publishedAt)
      .sort()
      .at(-1);
    expect((await transform("/blog")).lastmod).toBe(latest);
  });

  it("既定の transform と同じ項目を返す（lastmod 以外は既定のまま）", async () => {
    const field = await transform("/blog");
    expect(field.loc).toBe("/blog");
    expect(field.changefreq).toBe(config.changefreq);
    expect(field.priority).toBe(config.priority);
    expect(field.alternateRefs).toEqual([]);
  });
});
