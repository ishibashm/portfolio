import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("/houi/tenchusatsu の配線", () => {
  const page = readFileSync("src/app/houi/tenchusatsu/page.tsx", "utf8");
  const checker = readFileSync(
    "src/components/houi/TenchusatsuChecker.tsx",
    "utf8",
  );
  it("FAQ JSON-LD・canonical・ISR を持つ", () => {
    expect(page).toMatch(/<FaqJsonLd items=\{FAQ\} \/>/);
    expect(page).toMatch(/canonical: "\/houi\/tenchusatsu"/);
    expect(page).toMatch(/export const revalidate = \d+/);
  });
  it("指定のブログ記事と相談導線へリンクする", () => {
    for (const href of [
      "/blog/moving-during-tenchusatsu",
      "/blog/houi-and-tenchusatsu",
      "/ask",
    ])
      expect(page).toContain(`"${href}"`);
    expect(page).toMatch(/<PractitionerStrip \/>/);
  });
  it("client 部品は暦エンジンを import しない", () => {
    expect(checker).not.toMatch(
      /lunar-javascript|ephemerisEngine|utils\/tenchusatsu"/,
    );
    expect(checker).not.toMatch(/tenchusatsuTimeline/);
  });
  it("本命星×年ページから辿れる", () => {
    expect(
      readFileSync("src/app/houi/[year]/[star]/page.tsx", "utf8"),
    ).toContain('"/houi/tenchusatsu"');
  });
  it("サイトマップから除外されていない", () => {
    expect(readFileSync("next-sitemap.config.js", "utf8")).not.toMatch(
      /["']\/houi\/tenchusatsu["']/,
    );
  });
});
