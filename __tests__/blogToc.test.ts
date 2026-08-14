import { describe, expect, it } from "vitest";

import { extractHeadings, headingId } from "@/lib/blogToc";
import { getBlogPost, getBlogPosts } from "@/lib/blog";

/**
 * 記事の目次（h2 の抜き出しとアンカー id）。
 *
 * 守るのは 2 つ。
 *   1. 目次の id と描画側の id が同じ規則で作られること。ずれると
 *      「押しても飛ばない目次」になり、壊れていることに気付きにくい
 *   2. h2 だけを拾うこと。h3 まで載せると行数ばかり増える
 */
describe("extractHeadings", () => {
  it("h2 だけを順に拾う", () => {
    const body = [
      "## 先に結論",
      "本文。",
      "### 小見出しは拾わない",
      "## 1. なぜ方角が変わらないのか",
    ].join("\n");

    expect(extractHeadings(body).map((h) => h.text)).toEqual([
      "先に結論",
      "1. なぜ方角が変わらないのか",
    ]);
  });

  it("コードブロックの中の ## は見出しではない", () => {
    const body = ["## 本物", "```", "## コメントに見える行", "```"].join("\n");

    expect(extractHeadings(body)).toHaveLength(1);
  });

  it("強調・コード記号は id にも表示にも残さない", () => {
    const [h] = extractHeadings("## **重要**な`話`");
    expect(h.text).toBe("重要な話");
    expect(h.id).toBe("重要な話");
  });

  it("id に空白を残さない", () => {
    expect(headingId("5. 実務として どう扱うか")).toBe(
      "5.-実務として-どう扱うか",
    );
  });

  // 公開中の全記事で目次が成立していること。h2 の書き方が変わって
  // 目次が空になっても、描画は落ちないので気付けない。ここで見張る。
  it("公開中の記事はどれも目次を組める（h2 が 2 つ以上）", () => {
    for (const summary of getBlogPosts()) {
      const post = getBlogPost(summary.slug);
      const headings = extractHeadings(post?.body ?? "");
      expect(
        headings.length,
        `${summary.slug} の h2 が ${headings.length} 個`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
