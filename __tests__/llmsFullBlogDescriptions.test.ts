import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBlogPosts } from "@/lib/blog";

/**
 * llms-full.txt の記事の行に、題だけでなく説明文が載ること。
 *
 * 記事の説明文は「先に結論」を縮めた答えとして書いてある。題だけだと
 * AI には問い（「天中殺に引越しすると影響はあるのか」）しか渡らず、
 * 答え（日数・期間）を引くには記事を開く必要があった。
 *
 * route は DB を読むのでテストから叩けない。llmsGeography と同じく、
 * **生成の材料**（Markdown の説明文が 1 行の箇条書きに収まるか）と、
 * route が説明文を使っていることを固定する。
 */

const route = readFileSync(
  join(__dirname, "../src/app/llms-full.txt/route.ts"),
  "utf-8",
);

describe("llms-full.txt の記事の行", () => {
  it("route が説明文を行に載せている（空白は畳む）", () => {
    expect(route).toContain("post.description.replace(/\\s+/g");
    expect(route).toContain("`${line}: ${description}`");
  });

  const posts = getBlogPosts();

  it("公開記事がある", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it.each(posts.map((p) => [p.slug, p.description] as const))(
    "%s の説明文は空でなく、1 行に収まり、リンク記法を含まない",
    (_slug, description) => {
      expect(description.trim()).not.toBe("");
      // 改行があると箇条書きが割れる（route は畳むが、Markdown 側でも持たない）
      expect(description).not.toMatch(/\n/);
      // [題](URL): のあとに [..](..) が来ると、行のリンクが読み違えられる
      expect(description).not.toMatch(/\]\(/);
    },
  );
});
