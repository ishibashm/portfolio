import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { GUIDE_PAGES, findGuidePage } from "@/lib/guideContent";
import { isProtectedRoute } from "@/utils/supabase/routeAccess";

/**
 * ガイド本文に書いた内部リンクは、綴りを間違えても画面には何も出ない。
 * リンクとして描画されたうえで 404 に飛ぶだけなので、目視では見つからない。
 * 実在するページかどうかをここで固定する。
 */

const APP = path.join(process.cwd(), "src", "app");

/** 静的ページの実体があるか。動的ルートは対象外（ガイドからは張っていない）。 */
function pageExists(href: string): boolean {
  const rel = href.replace(/^\//, "");
  const dir = rel ? path.join(APP, rel) : APP;
  return (
    existsSync(path.join(dir, "page.tsx")) || existsSync(path.join(dir, "page.ts"))
  );
}

/** 本文中のすべての文字列（表のセルまで含めて）を取り出す */
function textsOf(page: (typeof GUIDE_PAGES)[number]): string[] {
  const out: string[] = [page.lead, page.title, page.description];
  for (const b of page.blocks) {
    switch (b.k) {
      case "h":
        out.push(b.t);
        break;
      case "p":
        out.push(b.t);
        break;
      case "list":
      case "steps":
        out.push(...b.items);
        break;
      case "table":
        out.push(...b.head, ...b.rows.flat());
        break;
      case "note":
        out.push(b.t, b.body);
        break;
      case "cta":
        break;
    }
  }
  return out;
}

function linksOf(page: (typeof GUIDE_PAGES)[number]): string[] {
  const found: string[] = [];
  for (const t of textsOf(page)) {
    for (const m of t.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) found.push(m[1]);
  }
  for (const b of page.blocks) {
    if (b.k === "cta") found.push(b.href);
  }
  if (page.target) found.push(page.target.href);
  return found;
}

describe("使い方ガイドの本文", () => {
  it("slug が重複していない", () => {
    const slugs = GUIDE_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("すべての章に見出し・説明・本文がある", () => {
    for (const p of GUIDE_PAGES) {
      expect(p.title.length, p.slug).toBeGreaterThan(0);
      expect(p.description.length, p.slug).toBeGreaterThan(20);
      expect(p.lead.length, p.slug).toBeGreaterThan(10);
      expect(p.blocks.length, p.slug).toBeGreaterThan(0);
    }
  });

  it("本文の内部リンクがすべて実在するページを指している", () => {
    const slugs = new Set(GUIDE_PAGES.map((p) => p.slug));

    for (const page of GUIDE_PAGES) {
      for (const href of linksOf(page)) {
        expect(href.startsWith("/"), `${page.slug}: 外部リンクは想定していない (${href})`).toBe(true);

        const guide = href.match(/^\/guide\/([\w-]+)$/);
        if (guide) {
          expect(slugs.has(guide[1]), `${page.slug}: 章が無い (${href})`).toBe(true);
          continue;
        }
        expect(pageExists(href), `${page.slug}: ページが無い (${href})`).toBe(true);
      }
    }
  });

  it("リンクを強調で包んでいない", () => {
    // GuideBody の記法は入れ子を解釈しない。**[…](…)** と書くと強調が先に
    // 当たり、リンク記法がそのまま画面に出る。書いた側は気づけないので固定する。
    for (const page of GUIDE_PAGES) {
      for (const t of textsOf(page)) {
        expect(/\*\*\[[^\]]+\]\([^)]+\)\*\*/.test(t), `${page.slug}: ${t}`).toBe(
          false,
        );
      }
    }
  });

  it("ガイドはログイン不要（保護対象に入っていない）", () => {
    expect(isProtectedRoute("/guide")).toBe(false);
    for (const p of GUIDE_PAGES) {
      expect(isProtectedRoute(`/guide/${p.slug}`)).toBe(false);
    }
  });

  it("findGuidePage が定義済みの slug だけを返す", () => {
    expect(findGuidePage("basics")?.slug).toBe("basics");
    expect(findGuidePage("does-not-exist")).toBeUndefined();
  });
});
