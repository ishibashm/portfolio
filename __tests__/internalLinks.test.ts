import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * サイト内のリンクが、実在する宛先を指していること。
 *
 * ホームの札が /relocation/auspicious-days を指していた。**その頁は無い**
 * （あるのは同じ名前の API だけ）。ホームから 404 へリンクしていて、
 * Search Console が 404 として拾っていた（2026-08-16 の報告で 19 頁）。
 *
 * 型検査では出ない。href は文字列で、綴りが合っていれば通る。
 * 頁を消したり移したりしたときにも黙って壊れる。ここで固定する。
 *
 * 見るのは **src の中に直接書いた内部リンク**だけ。記事本文（DB）の
 * リンクや外部リンクは対象外。
 */

const APP = join(process.cwd(), "src", "app");
const SRC = join(process.cwd(), "src");
const PUBLIC = join(process.cwd(), "public");

/** app ディレクトリから実在する経路を集める。 */
function collectRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (!statSync(p).isDirectory()) {
        // page は画面、route は llms.txt のような応答も含む。
        if (/^(page|route)\.(tsx|ts|jsx|js|mdx)$/.test(e)) {
          routes.push(prefix || "/");
        }
        continue;
      }
      if (e.startsWith("_")) continue;
      // (group) は URL に出ない。
      const seg = /^\(.*\)$/.test(e) ? "" : `/${e}`;
      walk(p, prefix + seg);
    }
  };
  walk(APP, "");
  return routes;
}

/** 動的区間（[code] や [...slug]）を含む経路を照合できる形にする。 */
function toMatcher(route: string): RegExp {
  const body = route
    .replace(/\[\[?\.\.\.[^\]]+\]\]?/g, ".*")
    .replace(/\[[^\]]+\]/g, "[^/]+");
  return new RegExp(`^${body}$`);
}

/** src の中に直接書いた内部リンクを集める。 */
function collectLinks(): Map<string, string[]> {
  const links = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(e)) continue;
      const s = readFileSync(p, "utf8");
      // テンプレート記法（${...}）を含むものは宛先が実行時に決まるので外す。
      for (const m of s.matchAll(/href=["'](\/[^"'`${}\s]*)["']/g)) {
        const href = m[1].split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
        const files = links.get(href) ?? [];
        if (!files.includes(p)) files.push(p);
        links.set(href, files);
      }
    }
  };
  walk(SRC);
  return links;
}

const ROUTES = collectRoutes();
const MATCHERS = ROUTES.map(toMatcher);
const LINKS = collectLinks();

function resolves(href: string): boolean {
  if (MATCHERS.some((re) => re.test(href))) return true;
  // public に置いた静的ファイル（アイコンなど）。
  return existsSync(join(PUBLIC, href.replace(/^\//, "")));
}

describe("サイト内のリンク", () => {
  it("経路を拾えている（この検査自体が空回りしていない）", () => {
    expect(ROUTES.length).toBeGreaterThan(10);
    expect(LINKS.size).toBeGreaterThan(10);
  });

  it("実在しない宛先を指していない", () => {
    const broken = [...LINKS.entries()]
      .filter(([href]) => !href.startsWith("/api/"))
      .filter(([href]) => !resolves(href))
      .map(([href, files]) => `${href}  ←  ${files.join(", ")}`);

    expect(broken).toEqual([]);
  });

  it("無い頁を指すと気付ける（検査が効いていることの確認）", () => {
    expect(resolves("/relocation/auspicious-days")).toBe(false);
    expect(resolves("/calendar")).toBe(true);
  });
});
