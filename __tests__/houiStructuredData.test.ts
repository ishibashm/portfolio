import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const houi = readFileSync("src/app/houi/page.tsx", "utf8");
const today = readFileSync("src/app/houi/today/page.tsx", "utf8");

describe("/houi と /houi/today の構造化データ", () => {
  it("/houi は BreadcrumbList と FAQPage を出す", () => {
    expect(houi).toMatch(/<BreadcrumbJsonLd/);
    expect(houi).toMatch(/<FaqJsonLd items=\{HOUI_FAQ\}/);
  });
  it("FAQ の答えは頁の本文（用語について）と同じ文言", () => {
    expect(houi).toMatch(
      /answer: "五黄土星が回座する方位。最も避けるべき方位とされます。"/,
    );
    expect(
      houi.split("五黄土星が回座する方位。最も避けるべき方位とされます。")
        .length,
    ).toBe(3);
    expect(houi.split("五黄殺の正反対にあたる方位です。").length).toBe(3);
  });
  it("/houi から /blog/houi-and-tenchusatsu へ文脈リンク", () => {
    expect(houi).toMatch(/href="\/blog\/houi-and-tenchusatsu"/);
  });
  it("/houi/today は BreadcrumbList を出す", () => {
    expect(today).toMatch(/<BreadcrumbJsonLd/);
    expect(today).toMatch(/path: "\/houi\/today"/);
  });
});
