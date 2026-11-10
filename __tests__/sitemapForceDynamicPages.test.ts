import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";

/**
 * **force-dynamic の頁は、next-sitemap が自動では拾わない。**
 *
 * next-sitemap はビルドが書き出す事前生成の一覧（prerender-manifest）から
 * URL を集める。`export const dynamic = "force-dynamic"` の頁はそこに
 * 出てこないので、索引する頁でも sitemap から黙って漏れる。
 * /relocation/dashboard と /relocation/arbitrage が実際に漏れていた
 * （サイト監査 2026-11-10。sitemap 531 URL に無かった）。
 *
 * ここでは、静的な URL の頁のうち
 *   - force-dynamic で（page.tsx か同じ階層の layout.tsx に書いてある）
 *   - noindex ではなく
 *   - exclude にも当たらない
 * ものが、additionalPaths に入っていることを固定する。
 * 索引しない頁（/ask など）はここに載せない。それは
 * sitemapNoindexAgreement.test.ts が見張っている。
 */

const require_ = createRequire(import.meta.url);
const sitemapConfig = require_(
  path.resolve(process.cwd(), "next-sitemap.config.js"),
);

const APP_DIR = path.join(process.cwd(), "src", "app");
const excluded: string[] = sitemapConfig.exclude ?? [];

/** next-sitemap の matcher と同じ作り方（アスタリスクは / を越える）。 */
function isExcluded(url: string): boolean {
  return excluded.some((pattern) => {
    const escaped = pattern
      .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
      .replace(/\*/g, "[\\s\\S]*");
    return new RegExp(`^${escaped}$`, "i").test(url);
  });
}

function read(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

function forceDynamicIndexableRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // [param] を含む頁は URL がここでは決まらない
        if (!entry.name.includes("[")) walk(full);
        continue;
      }
      if (entry.name !== "page.tsx") continue;
      const src = read(full) + read(path.join(dir, "layout.tsx"));
      if (!/export const dynamic\s*=\s*["']force-dynamic["']/.test(src))
        continue;
      if (/index:\s*false/.test(src)) continue;
      const route =
        "/" +
        path
          .relative(APP_DIR, dir)
          .split(path.sep)
          .filter((seg) => seg !== "" && !/^\(.*\)$/.test(seg))
          .join("/");
      out.push(route === "/" ? route : route.replace(/\/$/, ""));
    }
  };
  walk(APP_DIR);
  return out.filter((route) => !isExcluded(route));
}

describe("force-dynamic で索引する頁のサイトマップ", () => {
  it("additionalPaths に入っている", async () => {
    const entries: Array<{ loc: string }> =
      await sitemapConfig.additionalPaths(sitemapConfig);
    const added = new Set(entries.map((e) => e.loc));
    const routes = forceDynamicIndexableRoutes();

    // 空振りの見張りにしない。見つかるはずの頁が見つかっていること
    expect(routes).toContain("/relocation/arbitrage");
    expect(routes).toContain("/relocation/dashboard");

    for (const route of routes) {
      expect(
        added.has(route),
        `${route} は force-dynamic で、索引する頁なのに sitemap に無い。next-sitemap.config.js の additionalPaths に足す（索引しないなら noindex にする）`,
      ).toBe(true);
    }
  });
});
