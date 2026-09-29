import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION } from "@/lib/siteStructure";

/**
 * サイトの紹介文は siteStructure の SITE_DESCRIPTION が正。
 *
 * public/manifest.json（ホーム画面に追加したときのアプリの説明）は JSON
 * なので import できず、同じ文を写してある。2026-09-30 に紹介文を今の
 * 出どころ（公的な統計）に合わせたとき、写しがあることを見落とすと
 * 片方だけ古い文言が残る。突き合わせて固定する。
 */
describe("サイトの紹介文", () => {
  it("manifest.json の説明と同じ", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public/manifest.json"), "utf8"),
    ) as { description?: string };
    expect(manifest.description).toBe(SITE_DESCRIPTION);
  });

  it("止めた取り込み（賃貸物件のデータ）を出どころとして名乗らない", () => {
    expect(SITE_DESCRIPTION).not.toContain("賃貸物件のデータ");
  });
});
