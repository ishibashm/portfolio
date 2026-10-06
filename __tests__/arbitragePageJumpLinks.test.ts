import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /relocation/arbitrage の頭に、頁の中の行き先（住所の欄・街の一覧・
 * 地図）があり、どれも実在する id を指していること。
 *
 * 住所の欄は左の列の 4 番目で、狭い画面では設定・方位の一覧・街の一覧を
 * 全部通り過ぎないと届かなかった（利用者の依頼 2026-10-05）。
 */

const SRC = readFileSync(
  join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
  "utf8",
);

describe("頁の中の行き先", () => {
  const nav = SRC.match(/<nav\s+aria-label="この頁の中"[\s\S]*?<\/nav>/)?.[0];

  it("行き先の列がある", () => {
    expect(nav).toBeTruthy();
  });

  it.each([
    ["#arb-spot-section", "住所・物件URLから調べる"],
    ["#arb-towns-section", "方位ごとの街"],
    ["#candidate-location-map", "地図"],
  ])("%s（%s）は実在する id を指し、飛んだ先に余白がある", (href, label) => {
    expect(nav).toContain(`"${href}"`);
    expect(nav).toContain(`"${label}"`);
    const id = href.slice(1);
    const tag = SRC.match(
      new RegExp(`id="${id}"\\s*\\n\\s*className="([^"]*)"`),
    );
    expect(tag, `id="${id}" の器`).not.toBeNull();
    /* 飛んだ先が画面の縁に貼り付かない */
    expect(tag![1]).toContain("scroll-mt-4");
  });
});
