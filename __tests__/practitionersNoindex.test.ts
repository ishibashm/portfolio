import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { metadata } from "@/app/practitioners/layout";

/**
 * /practitioners は、承認済みの掲載が 0 件のあいだ noindex, follow
 * （2026-11-10 にオーナーが決定。/ask と同じ形）。
 *
 * 見張るのは、noindex・サイトマップ・夜間監査の 3 つが揃っていること。
 * 揃っていないと「noindex なのにサイトマップにいる」「夜間監査が
 * noindex を探して落ちる」のどちらかが起きる。戻す手順は
 * src/app/practitioners/layout.tsx のコメント。戻したらこのテストも消す。
 */

const ROOT = path.join(__dirname, "..");
const config = createRequire(import.meta.url)(
  path.join(ROOT, "next-sitemap.config.js"),
);

describe("/practitioners（掲載 0 件のあいだ noindex）", () => {
  it("robots は noindex, follow（/ask と同じ形）", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("canonical は自分自身のまま", () => {
    expect(metadata.alternates?.canonical).toBe("/practitioners");
  });

  it("サイトマップから外れていて、戻し先（additionalPaths）にも無い", async () => {
    expect(config.exclude).toContain("/practitioners");
    const added: Array<{ loc: string }> = await config.additionalPaths(config);
    expect(added.map((e) => e.loc)).not.toContain("/practitioners");
  });

  it("夜間監査の「索引しない頁」の 2 か所（疎通・noindex）に入っている", () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, ".github", "workflows", "site-audit.yml"),
      "utf-8",
    );
    const loops = workflow
      .split("\n")
      .filter((l) => /for path in \/login \/profile \/account/.test(l));
    expect(loops).toHaveLength(2);
    for (const l of loops) expect(l).toContain("/practitioners");
  });
});
