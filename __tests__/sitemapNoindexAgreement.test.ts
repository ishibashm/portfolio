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
      /*
        metadata の robots で index を切っている頁だけ。
        **同じ階層の layout.tsx も見る。**"use client" の頁は metadata を
        書けないので、レイアウトを 1 枚挟んで索引の指示を出している
        （/login がそれ）。page.tsx だけを見ていると拾えなかった。
      */
      const layout = path.join(dir, "layout.tsx");
      const layoutSrc = fs.existsSync(layout)
        ? fs.readFileSync(layout, "utf-8")
        : "";
      if (!/index:\s*false/.test(src) && !/index:\s*false/.test(layoutSrc))
        continue;
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

    /*
      **exclude はパターンを含む。**`/admin/*` のような書き方があるので、
      字面の一致だけで見ると「一覧に無い」と誤って落ちる（実際に
      /admin/metrics で落ちた）。next-sitemap と同じく、アスタリスクを
      `[\s\S]*` に直した正規表現で当てる。
    */
    const covered = (route: string) =>
      exclude.some((pattern) => {
        const re = new RegExp(
          `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*")}$`,
        );
        return re.test(route);
      });

    const missing = staticNoindexRoutes().filter((route) => !covered(route));

    expect(
      missing,
      `サイトマップから外れていない noindex の頁: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("検査そのものが空回りしていない（/profile と /login を拾える）", () => {
    const routes = staticNoindexRoutes();
    expect(routes).toContain("/profile");
    /* レイアウトで索引を切っている頁。page.tsx だけを見ていると漏れる */
    expect(routes).toContain("/login");
  });
});

/**
 * **索引しない頁は、夜間監査の URL 巡回からも漏れる。**
 *
 * site-audit.yml の「sitemap の URL 健全性」は sitemap に載っている
 * URL しか見ない。索引しない頁はそこに載らないので、500 を返すように
 * なっても誰も気付かない。登録・ログイン・マイページは利用者が実際に
 * 使う入口なので、生きていることだけは毎晩見る。
 *
 * 一覧を 2 か所に置くことになるので、ここで突き合わせる。
 */
describe("索引しない頁を夜間監査が見ている", () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, ".github", "workflows", "site-audit.yml"),
    "utf-8",
  );

  it("静的な noindex の頁は、監査の巡回一覧に入っている", () => {
    const missing = staticNoindexRoutes()
      /* 管理画面は認証が要るので、匿名の巡回では 200 を返さない。
         生きているかは運営者が開けば分かる。ここでは見ない */
      .filter((route) => !route.startsWith("/admin"))
      /* 一覧は `for path in /login /profile /account; do` の形で並ぶ。
         最後の 1 つはセミコロンが続くので、区切りに入れておく */
      .filter(
        (route) => !new RegExp(`(^|\\s)${route}(\\s|;|$)`, "m").test(workflow),
      );

    expect(
      missing,
      `夜間監査が見ていない noindex の頁: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("検査そのものが空回りしていない（監査の側に一覧がある）", () => {
    expect(workflow).toContain("索引しない頁");
    expect(workflow).toMatch(/for path in \/login \/profile \/account/);
  });
});
