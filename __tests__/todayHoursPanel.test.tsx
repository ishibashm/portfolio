import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  TodayHoursCard,
  TodayHoursPanel,
} from "@/components/home/TodayHoursPanel";
import {
  buildCurrentDirections,
  buildTodayDirections,
} from "@/lib/todayDirections";

const now = new Date("2026-11-19T20:00:00+09:00");
const list = (items: string[]) => items.join("・") || "なし";

it("今の刻と9星の吉方位を出し、時間帯の表は畳んで置く", () => {
  const data = buildTodayDirections(now);
  const current = buildCurrentDirections(now);
  const html = renderToStaticMarkup(
    <TodayHoursCard data={data} current={current} />,
  );
  expect(html).toContain("今日の吉方位と時間");
  expect(html).toContain("今の刻：");
  expect(html).toContain(`${current.branch}の刻`);
  expect(html).toContain("本命星別の今の刻の吉方位");
  expect(html).toContain("本命星別の今の刻と、十二支の時間帯を見る");
  expect(html).not.toContain("/today/banner-960.webp");

  expect(html).toContain("<details");
  // 横断幕を重複させず、本命星の表を畳む。
  const detailsAt = html.indexOf("<details");
  expect(detailsAt).toBeLessThan(html.indexOf("本命星別の今の刻の吉方位"));
  expect(html).toContain('name="home-honmei-hours"');
  expect(html).toContain("詳しい日盤と、現在地での今の刻を見る");
  expect(html).toContain('href="/houi/today"');
  expect(html).toContain('href="/houi#honmei-lookup"');
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<input");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<button");
  expect(html).toContain("今の刻");
  for (const star of data.stars) {
    expect(html).toContain(star.name);
    const hour = star.hours.find((item) => item.branch === current.branch)!;
    expect(html).toContain(list(hour.lucky));
  }
  expect(data.stars[0].hours).toHaveLength(12);
  expect(html.match(/scope="row"/g)?.length).toBeGreaterThanOrEqual(9 + 12);
});

it("ホームは入力なしのサーバー描画で、天気の直下に置く", async () => {
  const html = renderToStaticMarkup(await TodayHoursPanel());
  expect(html).toContain("今日の吉方位と時間");
  expect(html).toContain("東京基準の真太陽時");
  const source = readFileSync(
    "src/components/home/TodayHoursPanel.tsx",
    "utf8",
  );
  expect(source).not.toMatch(/^"use client"/m);
  expect(source).not.toContain("geolocation");
  const home = readFileSync("src/app/page.tsx", "utf8");
  expect(home).toContain("<TodayHoursPanel origin={origin} />");
  expect(home.indexOf("<TodayOverview origin={origin}")).toBeLessThan(
    home.indexOf("<TodayHoursPanel origin={origin} />"),
  );
  expect(home.indexOf("<TodayHoursPanel origin={origin} />")).toBeLessThan(
    home.indexOf("<AgentEntry"),
  );
  expect(home).toMatch(/export const revalidate = 60/);
});

it("しるべの横断幕はホームへ移し、/houi/today の先頭からは外す", () => {
  const fortune = readFileSync(
    "src/components/houi/TodayFortunePanel.tsx",
    "utf8",
  );
  expect(fortune).not.toContain("/today/banner-");
  expect(fortune).not.toContain("PanelBanner");
  const todayPage = readFileSync("src/app/houi/today/page.tsx", "utf8");
  expect(todayPage).not.toContain("/today/banner-");
  const homePanel = readFileSync(
    "src/components/home/TodayHoursPanel.tsx",
    "utf8",
  );
  expect(homePanel).not.toContain("TodayShirubeBanner");
  expect(readFileSync("src/app/page.tsx", "utf8")).toContain(
    "<TodayShirubeBanner",
  );
});
