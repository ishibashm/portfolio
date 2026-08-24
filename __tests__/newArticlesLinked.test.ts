/**
 * 新しい記事へ、内容の合う画面から導線があること。
 *
 * Search Console の実測（2026-08-24、過去 3 か月）で分かったこと。
 *
 *   ・検索クエリ 18 件のうち 15 件が「◯◯市 家賃相場」の形
 *   ・掲載順位 27〜45 位、クリック 0
 *   ・市区町村別のページ（/houi/area/*）は #379 で noindex にした
 *
 * **需要はあるのに、答えるページが索引に無い。**記事を足しただけでは
 * 埋まらないので、数字を出している画面から記事へ繋ぐ。
 *
 * ここで見るのは「繋がっていること」だけ。記事が消えたりパスが変わったり
 * したときに気付けるようにする。未使用のまま残った作りかけが何度も
 * 見つかっているので、片側だけの確認では足りない。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p: string) => existsSync(join(process.cwd(), p));

const MARKET = "how-we-analyze-the-rental-market";
const DISTANCE = "how-much-does-distance-matter";

describe("記事の実体がある", () => {
  it.each([MARKET, DISTANCE])("%s.md が置いてある", (slug) => {
    expect(exists(`content/blog/${slug}.md`)).toBe(true);
  });

  it.each([MARKET, DISTANCE])("%s は下書きではない", (slug) => {
    const src = read(`content/blog/${slug}.md`);
    expect(src).toContain("draft: false");
    // 説明が無いと検索結果に何も出ない。
    expect(src).toMatch(/^description: .{40,}$/m);
  });
});

describe("数字を出している画面から記事へ繋がっている", () => {
  it("エリア頁の相場の札から、相場の記事へ", () => {
    // 「◯◯市 家賃相場」で来た人が最初に見るのがこの札。
    const src = read("src/app/houi/area/[code]/page.tsx");
    expect(src).toContain(`/blog/${MARKET}`);
  });

  it("家賃市場の分析頁から、相場の記事へ", () => {
    const src = read("src/app/relocation/market/page.tsx");
    expect(src).toContain(`/blog/${MARKET}`);
  });

  it("近すぎる移動の注記から、距離の記事へ", () => {
    const src = read("src/components/relocation/SpotVerdict.tsx");
    expect(src).toContain(`/blog/${DISTANCE}`);
    // 注記そのものを消して記事リンクだけにしない。距離と横ずれの
    // 具体的な数字は、その場で出すほうが読まれる。
    expect(src).toContain("unstableNote");
  });
});
