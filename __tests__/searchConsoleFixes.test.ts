import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import path from "path";
import { metadata as loginMetadata } from "@/app/login/layout";
import { NON_CORE_DISALLOW } from "@/lib/siteStructure";
import nextConfig from "../next.config";

/**
 * Search Console の指摘に対する手当ての固定（2026-08-16 の書き出し）。
 *
 * 直したのは 2 つ。
 *
 *   重複、正規ページ未選択   /login?next=/rentals
 *   noindex で除外           /feed/
 *
 * ## 触らないと決めたもの（理由つき）
 *
 * - **フォント**（/_next/static/media/*.woff2）。404 が 15 件、403 が 1 件、
 *   「クロール済み-インデックス未登録」が 40 件あるが、**ほぼ全部これ。**
 *   ビルドごとにハッシュが変わる仕組みなので古い版が消えるのは正常。
 *   robots.txt で塞ぐ手はあるが、**描画に使う資材を塞ぐのは Google が
 *   避けるよう案内している**ので、報告が賑やかになるのを受け入れる
 * - **`/extract` と `/portfolio`**。削除済みで**後継が無い。**無関係な頁へ
 *   送ると soft 404 として扱われるので、404 のままが正しい
 * - **www と http のリダイレクト**。「ページにリダイレクトがあります」は
 *   next.config.ts の 301 が効いている証拠。直すものではない
 */

const require_ = createRequire(import.meta.url);
const sitemapConfig = require_(
  path.resolve(process.cwd(), "next-sitemap.config.js"),
);

async function redirects() {
  return (await nextConfig.redirects?.()) ?? [];
}

describe("ログイン画面は索引に載せない", () => {
  it("noindex, nofollow が付いている", () => {
    // `?next=` の戻り先ごとに URL が増えるが、中身はどれも同じ画面。
    expect(loginMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("robots.txt では塞がない（noindex を読ませるため）", () => {
    // 塞ぐと noindex を読めなくなり、「リンクだけを根拠に索引へ載る」形が
    // 残る。クロールは許して noindex を読ませる。
    expect(NON_CORE_DISALLOW).not.toContain("/login");
  });

  it("サイトマップには載せない", () => {
    expect(sitemapConfig.exclude).toContain("/login");
  });
});

describe("旧サイトの経路のリダイレクト", () => {
  it("/feed を RSS（/blog/feed.xml）へ 301 で送る", async () => {
    const feed = (await redirects()).find((r) => r.source === "/feed");
    expect(feed, "/feed のリダイレクトが無い").toBeDefined();
    expect(feed!.destination).toBe("/blog/feed.xml");
    expect(feed!.permanent).toBe(true);
  });

  it("後継が無いものは送らない（soft 404 を作らない）", async () => {
    // 削除済みで後継の無い頁。無関係な頁へ送ると soft 404 になる。
    const sources = (await redirects()).map((r) => r.source);
    for (const gone of ["/extract", "/portfolio"]) {
      expect(sources, `${gone} を送っている`).not.toContain(gone);
    }
  });

  it("www は正規のホストへ 301 で寄せる", async () => {
    const canonical = (await redirects()).find((r) =>
      r.has?.some(
        (h) => h.type === "host" && h.value === "www.cloud-palette.com",
      ),
    );
    expect(canonical, "www の寄せが無い").toBeDefined();
    expect(canonical!.destination).toContain("https://cloud-palette.com");
  });
});
