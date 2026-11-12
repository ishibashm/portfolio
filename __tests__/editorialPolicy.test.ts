import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PAGE = "src/app/editorial/page.tsx";
const GROUPED_NUMBER = /\d{1,3}(?:,\d{3})+/;

describe("/editorial（編集方針）", () => {
  it("出典・索引の範囲・広告・訂正窓口がある", () => {
    const src = read(PAGE);
    expect(src).toContain("情報の出典");
    expect(src).toContain("索引に載せるページ");
    expect(src).toContain("広告とアフィリエイト");
    expect(src).toContain("誤りと連絡");
    expect(src).toContain('canonical: "/editorial"');
    expect(src).toContain('href="/about"');
    expect(src).toContain('href="/privacy"');
    expect(src).toContain('href="/contact"');
    expect(src).toContain('href="/houi/pref"');
  });

  it("運営者の経歴や資格を作っていない", () => {
    const src = read(PAGE);
    expect(src).not.toMatch(/資格|監修|専門家です|年の経験|鑑定士です/);
    expect(src).not.toMatch(GROUPED_NUMBER);
  });

  it("フッターと /about から辿れる", () => {
    expect(read("src/components/SiteFooter.tsx")).toContain(
      'href: "/editorial"',
    );
    expect(read("src/app/about/page.tsx")).toContain('href="/editorial"');
  });
});
