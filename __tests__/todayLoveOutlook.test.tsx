import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TodayLoveOutlook } from "@/components/home/TodayLoveOutlook";
import { STARS, STAR_NAMES } from "@/lib/kigakuContent";
import { buildLoveFortune } from "@/lib/loveFortune";

it("見出し、9星のリンク、回座、吉方位と近場の目安を表示する", () => {
  const { items } = buildLoveFortune(new Date("2026-11-21T12:00:00+09:00"));
  const html = renderToStaticMarkup(<TodayLoveOutlook items={items} />);

  expect(html).toContain("今日の恋愛の目安");
  expect(html).toContain('aria-labelledby="today-love-heading"');
  expect(html).toContain('href="#today-hours-heading"');
  expect(html).toContain('href="/houi#honmei-lookup"');
  for (const star of STARS) {
    expect(html).toMatch(
      new RegExp(
        `<a[^>]+href="/houi/2026/${star}"[^>]*>${STAR_NAMES[star]}</a>`,
      ),
    );
  }
  expect(html).toContain(">北東に回座</p>");
  expect(html).toContain(">北東</span>");
  expect(html).toContain(">交わり・はじまり</span>");
  expect(html).toContain(">会合や約束の外出先に</p>");
  expect(html.match(/近場が目安/g)).toHaveLength(4);
  expect(html.match(/bg-theme-bad-soft/g)).toHaveLength(1);
  expect(html).toContain("その方位への外出は控え");
});

it("翌日も日盤に応じた方位と近場の目安を表示する", () => {
  const { items } = buildLoveFortune(new Date("2026-11-22T12:00:00+09:00"));
  const html = renderToStaticMarkup(<TodayLoveOutlook items={items} />);
  expect(html).toContain("近場が目安");
  expect(html).toContain('aria-label="吉方位"');
});

it("サーバーコンポーネントとして描画する", () => {
  const source = readFileSync(
    "src/components/home/TodayLoveOutlook.tsx",
    "utf8",
  );
  expect(source).not.toMatch(/["']use client["']/);
});
