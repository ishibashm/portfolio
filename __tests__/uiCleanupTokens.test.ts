import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMonthlySummary, MONTHS } from "@/lib/kigakuContent";

const read = (f: string) => readFileSync(f, "utf8");

describe("UI トークン統一", () => {
  it("風水ページに indigo が無く wg-page を使う", () => {
    const src = read("src/app/houi/fengshui/page.tsx");
    expect(src).not.toMatch(/indigo/);
    expect(src).toMatch(/wg-page/);
  });

  it("body のフォントは --font-sans を使い Arial を直書きしない", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toMatch(/font-family:\s*Arial/);
    expect(css).toMatch(/font-family:\s*var\(--font-sans\)/);
  });

  it("トップページは Server Component（use client なし）でスクロール処理は分離", () => {
    const src = read("src/app/page.tsx");
    expect(src).not.toMatch(/^"use client"/m);
    expect(src).not.toMatch(/useEffect/);
    expect(src).toMatch(/<ScrollTopOnMount \/>/);
    expect(src).toMatch(/<HonmeiLookup/);
  });

  it("本命星×年ページは月別サマリーを常時表示し、算出方法の比較は details に入れる", () => {
    const src = read("src/app/houi/[year]/[star]/page.tsx");
    expect(src).not.toMatch(/月を選んで開く/);
    expect(src).toMatch(/getMonthlySummary/);
    expect(src).toMatch(/<details[\s\S]*算出方法による違い[\s\S]*<\/details>/);
  });

  it("/houi は HonmeiLookup を立春の注記より先に置く", () => {
    const src = read("src/app/houi/page.tsx");
    expect(src.indexOf("<HonmeiLookup")).toBeLessThan(
      src.indexOf("立春（2月4日ごろ）"),
    );
  });
});

describe("getMonthlySummary", () => {
  it("12 か月ぶんを返し、吉と凶が重ならない", () => {
    const rows = getMonthlySummary(2026, 1);
    expect(rows.map((r) => r.month)).toEqual(MONTHS);
    for (const r of rows) {
      expect(r.good.filter((d) => r.bad.includes(d))).toEqual([]);
      // 五黄殺・暗剣殺は誰にとっても凶なので、毎月少なくとも 2 方位は凶
      expect(r.bad.length).toBeGreaterThanOrEqual(2);
    }
  });
});
