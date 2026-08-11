import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import path from "path";
import { NON_CORE_ROUTES, NON_CORE_DISALLOW } from "@/lib/siteStructure";

/**
 * 検索・サイトマップから外すルートの定義が 1 か所であること。
 *
 * 以前は siteStructure.ts と next-sitemap.config.js が同じ一覧を別々に持ち、
 * 設定ファイルのコメントに「片方を変えたらもう片方も直すこと」と書いてあった。
 * 実際には食い違い、すでに削除した 9 ページ（/dashboard /metaphysical
 * /trends /rentals /visualizer /x-viewer /research /extract /agent-log
 * /ceremonial-sample）を next-sitemap だけが除外し続けていた。
 *
 * 手で揃える約束は守られない。ここで機械に見張らせる。
 */

const require_ = createRequire(import.meta.url);
const sitemapConfig = require_(
  path.resolve(process.cwd(), "next-sitemap.config.js"),
);

describe("非中核ルートの定義", () => {
  it("サイトマップの設定と同じ一覧を見ている", () => {
    const excluded: string[] = sitemapConfig.exclude ?? [];
    for (const route of NON_CORE_ROUTES) {
      expect(
        excluded.some((e) => e === route || e === `${route}/*`),
        `${route} がサイトマップの除外に無い`,
      ).toBe(true);
    }
  });

  it("削除済みのページを除外し続けていない", () => {
    // 存在しないページを除外しても実害は軽いが、定義がずれている印になる。
    const gone = [
      "/dashboard",
      "/metaphysical",
      "/trends",
      "/rentals",
      "/visualizer",
      "/x-viewer",
      "/research",
      "/extract",
      "/agent-log",
      "/ceremonial-sample",
    ];
    const excluded: string[] = sitemapConfig.exclude ?? [];
    for (const g of gone) {
      expect(
        excluded.some((e) => e === g || e === `${g}/*`),
        `${g} は削除済みなのに除外一覧に残っている`,
      ).toBe(false);
    }
  });

  it("robots の Disallow は末尾にスラッシュを付けない", () => {
    // "/foo/" と書くと配下しか塞がず "/foo" 本体が素通りする。
    for (const d of NON_CORE_DISALLOW) {
      expect(d.endsWith("/"), d).toBe(false);
      expect(d.startsWith("/"), d).toBe(true);
    }
  });

  it("中核ページを間違って閉じていない", () => {
    const excluded: string[] = sitemapConfig.exclude ?? [];
    for (const core of [
      "/houi",
      "/calendar",
      "/relocation/arbitrage",
      "/relocation/wealth",
      "/relocation/market",
      "/relocation/timing",
      "/relocation/simulator",
    ]) {
      expect(NON_CORE_ROUTES, core).not.toContain(core);
      expect(excluded.some((e) => e === core || e === `${core}/*`), core).toBe(
        false,
      );
    }
  });
});
