import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 公開記事は、他の記事の本文から少なくとも 1 本リンクされていること。
 *
 * 2026-09-19 に数えたら、33 本のうち 6 本が他の記事から 1 本もリンク
 * されていなかった。うち 1 本（天中殺の名前と流派）は Search Console で
 * 表示がいちばん多かった記事で、検索から来る頁にサイト内からの入口が
 * 無い状態だった。記事を足しただけでは埋まらない（newArticlesLinked と
 * 同じ）。新しい記事を書いたら、内容の合う既存記事の本文から張る。
 *
 * 見るのは Markdown（content/blog）だけ。本番は DB を読むので、Markdown に
 * 張っても取り込み直すまで本番には出ない（CLAUDE.md 3 節）。
 */
const DIR = join(process.cwd(), "content", "blog");

function published(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".md")) continue;
    const md = readFileSync(join(DIR, f), "utf8");
    if (/^draft:\s*true\s*$/m.test(md)) continue;
    out.set(f.replace(/\.md$/, ""), md);
  }
  return out;
}

function inbound(posts: Map<string, string>): Map<string, number> {
  const count = new Map<string, number>();
  for (const [slug, md] of posts) {
    for (const m of md.matchAll(/\]\(\/blog\/([^)\s#?]+)/g)) {
      const target = m[1].replace(/\/$/, "");
      if (target === slug) continue;
      count.set(target, (count.get(target) ?? 0) + 1);
    }
  }
  return count;
}

describe("記事どうしの内部リンク", () => {
  const posts = published();
  const links = inbound(posts);

  it("記事を読めている（この検査自体が空回りしていない）", () => {
    expect(posts.size).toBeGreaterThan(10);
    expect([...links.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
  });

  it("存在しない記事へ張っていない", () => {
    const dangling = [...links.keys()].filter((t) => !posts.has(t));
    expect(dangling).toEqual([]);
  });

  it.each([...posts.keys()].sort())(
    "%s は他の記事から 1 本以上リンクされている",
    (slug) => {
      expect(links.get(slug) ?? 0).toBeGreaterThanOrEqual(1);
    },
  );
});
