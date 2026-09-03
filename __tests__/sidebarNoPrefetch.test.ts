import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * サイドバーの Link は画面内の経路を先読みしない。
 *
 * 既定（prefetch 省略）だと、どの頁を開いても直後に道具 15 頁ぶんの
 * JS（暦エンジン・グラフを含めて gzip 500 KB 前後）を裏で取りに行く。
 * 優先度は低いが帯域は共有なので、遅い回線ではいま見ている頁の地図と
 * 判定が後回しになる（backlog 17 節に実測）。
 *
 * Link を 1 つ足すときに省略すると黙って戻るので、字面で固定する。
 */
const sidebar = readFileSync(
  join(__dirname, "../src/components/GlobalSidebar.tsx"),
  "utf8",
);

describe("サイドバーの Link は prefetch しない", () => {
  it("<Link の数と prefetch={false} の数が一致する", () => {
    const links = (sidebar.match(/<Link\b/g) ?? []).length;
    const noPrefetch = (sidebar.match(/prefetch=\{false\}/g) ?? []).length;
    expect(links).toBeGreaterThan(0);
    expect(noPrefetch).toBe(links);
  });

  it("ログインの手がかりが無い端末では supabase を読まない", () => {
    expect(sidebar).toMatch(/if \(!hasAuthCookie\(\)\) return;/);
    expect(sidebar).toMatch(/sb-\[\^=;\]\*-auth-token/);
  });
});
