import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 検索エンジンが読む公開ファイルに、middleware を掛けないこと。
 *
 * 掛かっていると `/sitemap.xml` を取りに来ただけで updateSession が走り、
 * **1 回ごとに Supabase の getUser() へネットワーク往復**が入る。認証の
 * 要らない公開ファイルなのに、Supabase が遅い・落ちているときはそのまま
 * 取得の失敗になる。Search Console は sitemap.xml と sitemap.rss を
 * 「取得できませんでした」として記録していた（2025-09-11 が最終読み込み）。
 *
 * middleware は import すると Supabase のクライアントまで引き込むので、
 * ここは TypeScript のパーサで `config.matcher` の文字列だけを取り出し、
 * 正規表現として評価する。Next.js が実際に使うのと同じ文字列を見る。
 */

const MIDDLEWARE = join(process.cwd(), "src/middleware.ts");

/** `export const config = { matcher: [...] }` の中身。 */
function matcherPatterns(): string[] {
  const sf = ts.createSourceFile(
    MIDDLEWARE,
    readFileSync(MIDDLEWARE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "matcher" &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (ts.isStringLiteral(el)) found.push(el.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 見つからないなら middleware の書き方が変わっている。空回りを避ける。
  expect(found.length, "config.matcher が読み取れない").toBeGreaterThan(0);
  return found;
}

/** Next.js と同じく、パス全体に一致するかで判定する。 */
function isMatched(pathname: string): boolean {
  return matcherPatterns().some((p) => new RegExp(`^${p}$`).test(pathname));
}

describe("middleware を掛ける範囲", () => {
  it("検索エンジンが読む公開ファイルには掛けない", () => {
    for (const p of [
      "/sitemap.xml",
      "/sitemap-0.xml",
      "/sitemap.rss",
      "/robots.txt",
      "/ads.txt",
      "/llms.txt",
      "/llms-full.txt",
      "/manifest.json",
      "/sw.js",
    ]) {
      expect(isMatched(p), `${p} に middleware が掛かっている`).toBe(false);
    }
  });

  it("画像と Next.js の内部にも掛けない（今までどおり）", () => {
    for (const p of [
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/ogp.png",
      "/grid.svg",
    ]) {
      expect(isMatched(p), p).toBe(false);
    }
  });

  it("ページには今までどおり掛ける", () => {
    // ログインの判定が要るので、ここを外すと保護が消える。
    for (const p of [
      "/",
      "/admin/metrics",
      "/relocation/arbitrage",
      "/guide/honmei",
      "/api/favorites",
      "/login",
    ]) {
      expect(isMatched(p), `${p} に middleware が掛かっていない`).toBe(true);
    }
  });
});
