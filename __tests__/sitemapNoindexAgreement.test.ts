import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * **noindex にした頁をサイトマップに載せない。**
 *
 * 両方に載せると指示が食い違う（「載せるが索引するな」）。実際に
 * `/profile` が metadata で `robots: { index: false }` なのにサイトマップ
 * には載っていた（2026-09-05）。`/login` は最初から除外されていたので、
 * 頁を足したときに片方だけ直したと分かる。
 *
 * 静的な頁だけを見る。`[param]` を含む動的な頁は URL がここでは決まらず、
 * next-sitemap 側も別の仕組み（THIN_GENERATED）で外している。
 */

const ROOT = path.join(__dirname, "..");

function staticNoindexRoutes(): string[] {
  const appDir = path.join(ROOT, "src", "app");
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "page.tsx") continue;
      const src = fs.readFileSync(full, "utf-8");
      /* metadata の robots で index を切っている頁だけ */
      if (!/index:\s*false/.test(src)) continue;
      const route =
        "/" +
        path
          .relative(appDir, dir)
          .split(path.sep)
          .filter((seg) => seg !== "")
          .join("/");
      /* 動的な頁は URL が決まらないので対象外 */
      if (route.includes("[")) continue;
      out.push(route === "/" ? "/" : route);
    }
  };

  walk(appDir);
  return out.sort();
}

describe("noindex とサイトマップが食い違わない", () => {
  it("index: false の静的な頁は next-sitemap の exclude に入っている", () => {
    /* 設定は CommonJS なので require で読む（このファイルの持ち主と同じ） */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../next-sitemap.config.js");
    const exclude: string[] = config.exclude ?? [];

    const missing = staticNoindexRoutes().filter(
      (route) => !exclude.includes(route),
    );

    expect(
      missing,
      `サイトマップから外れていない noindex の頁: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("検査そのものが空回りしていない（/profile を拾える）", () => {
    expect(staticNoindexRoutes()).toContain("/profile");
  });
});
