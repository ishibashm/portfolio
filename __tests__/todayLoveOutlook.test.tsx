import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TodayLoveOutlook } from "@/components/home/TodayLoveOutlook";
import { STARS, STAR_NAMES } from "@/lib/kigakuContent";
import { buildLoveFortune } from "@/lib/loveFortune";

it("見出し、9星のリンク、回座、吉方位と近場の目安を表示する", () => {
  const { items, date, center } = buildLoveFortune(
    new Date("2026-11-21T12:00:00+09:00"),
  );
  const html = renderToStaticMarkup(
    <TodayLoveOutlook items={items} date={date} center={center} />,
  );

  expect(html).toMatch(
    /<h3 id="today-love-heading"[^>]*>.*今日の恋愛の目安<\/h3>/,
  );
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
  expect(html).toContain(
    '<time dateTime="2026-11-21">2026年11月21日（土）</time>',
  );
  expect(html).toContain(`中宮　${STAR_NAMES[center]}`);
  expect(
    html.match(/<svg aria-hidden="true" viewBox="0 0 20 20" class="size-5"/g),
  ).toHaveLength(9);
  expect(html).toContain(">北東に回座</span>");
  expect(html).toContain(">北東</span>");
  expect(html).toContain(">交わり・はじまり</span>");
  expect(html).toContain("吉方位ありの目安：会合や約束の外出先に</p>");
  expect(html.match(/会合や約束の外出先に/g)).toHaveLength(1);
  expect(
    html.match(/<svg aria-hidden="true" viewBox="-18 -18 36 36"/g),
  ).toHaveLength(9);
  expect(html.match(/近場が目安/g)).toHaveLength(4);
  expect(html.match(/bg-theme-bad-soft/g)).toHaveLength(1);
  expect(html).toContain("その方位への外出は控え");
  expect(html).toContain("<img");
  expect(html).toContain('alt=""');
  expect(html).toContain('width="1280"');
  expect(html).toContain('height="720"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain("love-horoscope-header.webp");
  expect(html).toContain("motion-plate-sweep");
  expect(html.match(/motion-twinkle/g)).toHaveLength(10);
  expect(html).toContain("motion-halo-spin");
  expect(html.match(/motion-reveal/g)).toHaveLength(9);
});

it("翌日も日盤に応じた方位と近場の目安を表示する", () => {
  const { items, date, center } = buildLoveFortune(
    new Date("2026-11-22T12:00:00+09:00"),
  );
  const html = renderToStaticMarkup(
    <TodayLoveOutlook items={items} date={date} center={center} />,
  );
  expect(html).toContain("近場が目安");
  expect(html).toContain('aria-label="吉方位"');
});

it("吉方位がある星の目安が揃わないときは各行に表示する", () => {
  const { items, date, center } = buildLoveFortune(
    new Date("2026-11-21T12:00:00+09:00"),
  );
  const firstLucky = items.findIndex(({ luckyHints }) => luckyHints.length > 0);
  const differentAction = "別の目安";
  const html = renderToStaticMarkup(
    <TodayLoveOutlook
      date={date}
      center={center}
      items={items.map((item, index) =>
        index === firstLucky ? { ...item, action: differentAction } : item,
      )}
    />,
  );

  expect(html).not.toContain("吉方位ありの目安：");
  expect(html).toContain(`>${differentAction}</p>`);
  expect(html.match(/会合や約束の外出先に/g)).toHaveLength(4);
});

it("吉方位が最多の星に印を表示し、全星が同数なら表示しない", () => {
  const { items, date, center } = buildLoveFortune(
    new Date("2026-11-21T12:00:00+09:00"),
  );
  const ninthStar = items.find(({ star }) => star === 9)!;
  expect(ninthStar.luckyHints).toHaveLength(4);
  const html = renderToStaticMarkup(
    <TodayLoveOutlook items={items} date={date} center={center} />,
  );
  expect(html.match(/今日吉方位が多い星/g)).toHaveLength(1);
  expect(html).toMatch(/>九紫火星<\/a>(?:(?!<\/li>).)*今日吉方位が多い星/);

  const tiedItems = items.map((item, index) =>
    index === 0 ? { ...item, luckyHints: ninthStar.luckyHints } : item,
  );
  const tiedHtml = renderToStaticMarkup(
    <TodayLoveOutlook items={tiedItems} date={date} center={center} />,
  );
  expect(tiedHtml.match(/今日吉方位が多い星/g)).toHaveLength(2);

  for (const luckyHints of [[], ninthStar.luckyHints]) {
    const equalItems = items.map((item) => ({ ...item, luckyHints }));
    const equalHtml = renderToStaticMarkup(
      <TodayLoveOutlook items={equalItems} date={date} center={center} />,
    );
    expect(equalHtml).not.toContain("今日吉方位が多い星");
  }
});

it("サーバーコンポーネントとして描画する", () => {
  const source = readFileSync(
    "src/components/home/TodayLoveOutlook.tsx",
    "utf8",
  );
  expect(source).not.toMatch(/["']use client["']/);
});
