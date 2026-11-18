import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CalendarPage from "@/app/calendar/page";
import { calendarMonthSlug, calendarMonths } from "@/lib/calendarMonths";
import { contentYears } from "@/lib/kigakuContent";

describe("/calendar 入口の静的結論と年・月別導線", () => {
  const html = renderToStaticMarkup(<CalendarPage />);
  const toolStart = html.indexOf("三盤に凶が入らない日を出す");

  it("三盤ツール（AuspiciousDayFinder）が描画されている", () => {
    expect(toolStart).toBeGreaterThan(0);
  });

  it("結論（暦の定義・占い上の目安・費用は別）が三盤ツールより前に出る", () => {
    const defText =
      "仏滅・赤口を外し、土用は間日以外を外したうえで、大安か天赦日・一粒万倍日が重なる日";
    const fortuneText = "占い上の目安";
    const tenshaText = "天赦日でも変わりません";
    const costText = "費用や予約の都合は、暦の話とは分けて考えてください";

    for (const phrase of [defText, fortuneText, tenshaText, costText]) {
      const idx = html.indexOf(phrase);
      expect(idx, `「${phrase}」が見つからない`).toBeGreaterThan(0);
      expect(idx, `「${phrase}」が三盤ツールより後ろにある`).toBeLessThan(
        toolStart,
      );
    }
  });

  it("contentYears() の各年へ /calendar/${year} のリンクが三盤ツールより前にある", () => {
    const years = contentYears();
    expect(years.length).toBeGreaterThanOrEqual(3);
    for (const year of years) {
      const href = `href="/calendar/${year}"`;
      const idx = html.indexOf(href);
      expect(idx, `${href} が見つからない`).toBeGreaterThan(0);
      expect(idx, `${href} が三盤ツールより後ろにある`).toBeLessThan(toolStart);
    }
  });

  it("calendarMonths() の各月へ /calendar/${slug} のリンクが三盤ツールより前にある", () => {
    const months = calendarMonths();
    expect(months).toHaveLength(18);
    for (const c of months) {
      const slug = calendarMonthSlug(c);
      const href = `href="/calendar/${slug}"`;
      const idx = html.indexOf(href);
      expect(idx, `${href} が見つからない`).toBeGreaterThan(0);
      expect(idx, `${href} が三盤ツールより後ろにある`).toBeLessThan(toolStart);
    }
  });

  it("/relocation/timing と /houi へのリンクがある", () => {
    expect(html.indexOf('href="/relocation/timing"')).toBeGreaterThan(0);
    expect(html.indexOf('href="/relocation/timing"')).toBeLessThan(toolStart);
    expect(html.indexOf('href="/houi"')).toBeGreaterThan(0);
    expect(html.indexOf('href="/houi"')).toBeLessThan(toolStart);
  });

  it("根拠のない最安・ランキング表現や「料金は大安や土日に上がる」を含まない", () => {
    for (const banned of [
      "最安",
      "全国対応",
      "ランキング",
      "No.1",
      "1位",
      "料金は大安や土日に上がる",
      "大安や土日に料金が上がる",
    ]) {
      expect(html).not.toContain(banned);
    }
  });

  it("page.tsx はサーバーコンポーネントであり、layout.tsx に入口本文を置いていない", () => {
    const pageSrc = readFileSync(
      join(process.cwd(), "src/app/calendar/page.tsx"),
      "utf8",
    );
    const layoutSrc = readFileSync(
      join(process.cwd(), "src/app/calendar/layout.tsx"),
      "utf8",
    );
    expect(pageSrc).not.toMatch(/^\s*["']use client["']/m);
    expect(layoutSrc).toContain("return <>{children}</>;");
  });
});
