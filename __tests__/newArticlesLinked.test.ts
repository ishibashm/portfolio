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
const ORDER = "direction-or-timing-which-matters";

describe("記事の実体がある", () => {
  it.each([MARKET, DISTANCE, ORDER])("%s.md が置いてある", (slug) => {
    expect(exists(`content/blog/${slug}.md`)).toBe(true);
  });

  it.each([MARKET, DISTANCE, ORDER])("%s は下書きではない", (slug) => {
    const src = read(`content/blog/${slug}.md`);
    expect(src).toContain("draft: false");
    // 説明が無いと検索結果に何も出ない。
    expect(src).toMatch(/^description: .{40,}$/m);
  });
});

describe("数字を出している画面から記事へ繋がっている", () => {
  it("エリア頁の札は、出どころそのものを書く", () => {
    /*
      **2026-09-19 に繋ぎ先が変わった。**それまでは相場の記事
      （中央値を使う理由と割安度の測り方）へ繋いでいたが、この頁の家賃は
      掲載から作るのをやめて公開統計に移した。記事の説明はもう当たらない。

      公開統計は出どころと調査年を書けば読み方が決まるので、記事に
      預けずに頁へ書く。
    */
    const src = read("src/app/houi/area/[code]/page.tsx");
    expect(src).not.toContain(`/blog/${MARKET}`);
    expect(src).toContain("住宅・土地統計調査");
    expect(src).toContain("出典：政府統計の総合窓口(e-Stat)");
  });

  it("家賃市場の分析頁から、相場の記事へ", () => {
    const src = read("src/app/relocation/market/page.tsx");
    expect(src).toContain(`/blog/${MARKET}`);
  });

  it("時期ツールの「読み方と限界」から、順序の記事へ", () => {
    // この画面は日取りを選ぶ道具なので、先に日付を決めてから方位を
    // 探す読み方をされやすい。年盤で塞がった方位は月日をどう選んでも
    // 段階が上がらない（実測で 365 日すべて X）ので、その順序に入ると
    // 候補が 1 日も出ない。順序の理由は記事の側に置いてある。
    const src = read("src/app/relocation/timing/page.tsx");
    expect(src).toContain(`/blog/${ORDER}`);
    /*
      リンクだけ置いて結論を記事に預けない。この 1 行が無いと、記事を
      開かなかった人には順序が伝わらない。

      **2026-09-20 に言い方を変えた。**「方位が先、日取りが後」は
      「先に方位を 1 つ決めて日を探すと、年盤で塞がった方位では候補が
      出ない」という意味だったが、利用者の指摘（方角が凶でない日付を
      選んでから移動する方角を決める）とぶつかる字面だった。頁の芯は
      「日を選んだら、その日に開いている方位の中から行き先を決める」。
      年盤で塞がった方位はどの日にも開かないので、この順でも同じ罠には
      入らない。
    */
    expect(src).toContain(
      "日を選んだら、その日に開いている方位の中から行き先を決めます。",
    );
    expect(src).not.toContain("方位が先、日取りが後です。");
  });

  it("近すぎる移動の注記から、距離の記事へ", () => {
    const src = read("src/components/relocation/SpotVerdict.tsx");
    expect(src).toContain(`/blog/${DISTANCE}`);
    // 注記そのものを消して記事リンクだけにしない。距離と横ずれの
    // 具体的な数字は、その場で出すほうが読まれる。
    expect(src).toContain("unstableNote");
  });
});
