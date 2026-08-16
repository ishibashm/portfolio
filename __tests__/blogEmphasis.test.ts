import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

/**
 * 記事の強調（**）が、記号のまま画面に出ていないこと。
 *
 * 利用者の指摘で見つけた。**37 箇所**が `**` のまま出ていた。
 * 原因は Markdown の規則で、日本語では踏みやすい。
 *
 *   **……。**そういう
 *          ↑ 閉じる ** の直前が句点（約物）、直後が文字
 *
 * CommonMark で閉じるには right-flanking であること、つまり
 * 「直前が非空白」かつ「直前が非約物、または直後が空白か約物」が要る。
 * 句点に挟まれるとどちらも満たさず、**強調が閉じられずに記号が残る。**
 * 句点を強調の外に出せば成立する（`**……**。そういう`）。
 *
 * 型検査でもリンタでも出ない。**実際に組み立ててみないと分からない。**
 * ここで全記事を通す。
 *
 * DB に入れた記事（管理画面から書いたもの）はここでは見られない。
 * 同じ書き方をすると同じことが起きるので、書くときは句点を強調の外に置くこと。
 */

const DIR = join(process.cwd(), "content", "blog");
const parser = unified().use(remarkParse).use(remarkGfm);

/** 組み立てたあとの本文に残っている `**` を集める。 */
function leftoverMarkers(markdown: string): string[] {
  const tree = parser.parse(markdown);
  const found: string[] = [];
  const walk = (node: {
    type: string;
    value?: string;
    children?: unknown[];
  }) => {
    if (node.type === "text" && node.value?.includes("**")) {
      found.push(node.value.trim().slice(0, 60));
    }
    for (const child of (node.children ?? []) as (typeof node)[]) walk(child);
  };
  walk(tree as never);
  return found;
}

const FILES = readdirSync(DIR).filter((f) => f.endsWith(".md"));

describe("記事の強調", () => {
  it("記事を読めている（この検査自体が空回りしていない）", () => {
    expect(FILES.length).toBeGreaterThan(3);
  });

  it.each(FILES)("%s に記号のままの ** が残っていない", (file) => {
    const raw = readFileSync(join(DIR, file), "utf8");
    expect(leftoverMarkers(raw)).toEqual([]);
  });

  it("句点を中に入れると気付ける（検査が効いていることの確認）", () => {
    // 直した形と壊れた形を並べて、違いが出ることを見る。
    expect(leftoverMarkers("**強調です**。つづき")).toEqual([]);
    expect(leftoverMarkers("**強調です。**つづき")).not.toEqual([]);
  });

  it("開き側の約物でも同じことが起きる", () => {
    expect(leftoverMarkers("「**かぎかっこ**」のあと")).toEqual([]);
    expect(leftoverMarkers("**「かぎかっこ」**のあと")).not.toEqual([]);
  });
});
