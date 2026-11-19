import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  fetchJson,
  __resetFetchJsonCacheForTest,
} from "@/lib/todayWeather/fetchJson";
import {
  parseNationalWeather,
  getNationalWeather,
} from "@/lib/todayWeather/national";
import {
  NationalWeatherCards,
  shortWeather,
  weatherEmoji,
} from "@/components/home/NationalWeather";
import {
  TodayOverview,
  TodayOverviewCard,
  citiesByDirection,
  cityDirectionsFor,
} from "@/components/home/TodayOverview";
import { buildTodayBoard } from "@/lib/todayDirections";
import { directionFromTokyo } from "@/lib/todayWeather/cityDirections";
import {
  mapCities,
  mapViewBox,
  project,
  insetBox,
  cardSize,
  narrowCities,
  narrowCardSize,
  narrowFontSize,
  narrowViewBox,
} from "@/lib/todayWeather/mapProjection";
import { getMonthlySummary, getMonthDirections } from "@/lib/kigakuContent";

// 全国ファイルの単一区域と、夕方・朝の発表の違いを再現する架空の予報。
const office = (
  officeCode: string,
  hour: string,
  temps: string[],
  tempDate = "2030-06-02",
) => ({
  officeCode,
  name: "架空気象台",
  srf: {
    reportDatetime: `2030-06-01T${hour}:00:00+09:00`,
    timeSeries: [
      {
        timeDefines: ["2030-06-01T05:00:00+09:00", "2030-06-02T00:00:00+09:00"],
        areas: {
          area: { name: "架空区域" },
          weathers: ["晴れ　 時々　くもり", "雨"],
        },
      },
      {
        timeDefines: [
          "2030-06-01T00:00:00+09:00",
          "2030-06-01T12:00:00+09:00",
          "2030-06-01T18:00:00+09:00",
          "2030-06-02T00:00:00+09:00",
        ],
        areas: { pops: ["90", "70", "20", "100"] },
      },
      {
        timeDefines: [
          `${tempDate}T00:00:00+09:00`,
          `${tempDate}T09:00:00+09:00`,
        ],
        areas: { temps },
      },
    ],
  },
  week: {},
});
const fixture = [
  office("230000", "17", ["12", "23"]),
  office("130000", "05", ["22", "22"], "2030-06-01"),
  { officeCode: "016000", srf: { timeSeries: [null] } },
  null,
];
const now = new Date("2030-06-01T19:00:00+09:00");
const response = (value: unknown) =>
  ({ ok: true, json: async () => value }) as Response;
afterEach(() => {
  __resetFetchJsonCacheForTest();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("全国の単一区域を指定順で読み、夕方の欠測と同値の最低を扱う", () => {
  const data = parseNationalWeather(fixture, now)!;
  expect(data.cities.map((c) => c.city)).toEqual(["東京", "名古屋"]);
  expect(data.reportDatetime).toBe("2030-06-01T17:00:00+09:00");
  expect(data.cities[1]).toMatchObject({
    areaName: "架空区域",
    prefectureCode: 23,
    today: { weather: "晴れ 時々 くもり" },
    tomorrow: { min: 12, max: 23 },
    pop: 20,
  });
  expect(data.cities[1].today.max).toBeUndefined();
  expect(data.cities[0].today).toEqual({
    date: "2030-06-01",
    weather: "晴れ 時々 くもり",
    max: 22,
  });
  expect(
    parseNationalWeather(fixture, new Date("2030-06-02T00:00:00+09:00"))!
      .cities[0].pop,
  ).toBeUndefined();
  expect(parseNationalWeather([null, {}])).toBeNull();
  expect(parseNationalWeather(null)).toBeNull();
});
it("10都市が指定順にそろい、壊れた日付の区域は省く", () => {
  const offices = [
    "016000",
    "040000",
    "150000",
    "130000",
    "230000",
    "270000",
    "340000",
    "390000",
    "400000",
    "471000",
  ];
  const all = offices.map((code) => office(code, "17", ["12", "23"])).reverse();
  expect(
    parseNationalWeather(all, now)!.cities.map((city) => city.prefectureCode),
  ).toEqual([1, 4, 15, 13, 23, 27, 34, 39, 40, 47]);
  const broken = office("016000", "17", ["12", "23"]);
  broken.srf.timeSeries[0].timeDefines[0] = "invalid";
  expect(
    parseNationalWeather([broken, ...fixture], now)!.cities.map(
      (city) => city.prefectureCode,
    ),
  ).toEqual([13, 23]);
});
it("全国は1リクエストだけで取得する", async () => {
  const fetcher = vi.fn(async () => response(fixture));
  expect(await getNationalWeather(fetcher)).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "https://www.jma.go.jp/bosai/forecast/data/forecast/010000.json",
    expect.objectContaining({ next: { revalidate: 1800 } }),
  );
});
it("TTL中は通信せず、期限後のエラー・HTTP失敗・不正JSONでは直前の値を返す", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => response({ fixture: true }));
  const first = await fetchJson("https://fixture.invalid/a", 30, fetcher);
  expect(await fetchJson("https://fixture.invalid/a", 30, fetcher)).toBe(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(31000);
  for (const failed of [
    vi.fn(async () => {
      throw new Error("timeout");
    }),
    vi.fn(async () => ({ ok: false }) as Response),
    vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new Error("json");
          },
        }) as unknown as Response,
    ),
  ]) {
    expect(await fetchJson("https://fixture.invalid/a", 30, failed)).toBe(
      first,
    );
    expect(
      await fetchJson("https://fixture.invalid/missing", 30, failed),
    ).toBeNull();
  }
});
it("同時取得をまとめる", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const first = fetchJson("https://fixture.invalid/a", 30, fetcher);
  const second = fetchJson("https://fixture.invalid/a", 30, fetcher);
  finish(response([1]));
  expect(await first).toEqual(await second);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("月の要約は元の計算と一致し、再利用しても呼び出し側の変更が混ざらない", () => {
  const expected = Array.from({ length: 12 }, (_, i) => {
    const { verdicts } = getMonthDirections(2030, i + 1, 3, "classical");
    return {
      month: i + 1,
      good: verdicts.filter((v) => v.kind === "good").map((v) => v.jp),
      bad: verdicts.filter((v) => v.kind === "bad").map((v) => v.jp),
    };
  });
  const first = getMonthlySummary(2030, 3);
  const start = performance.now();
  expect(getMonthlySummary(2030, 3)).toEqual(expected);
  expect(performance.now() - start).toBeLessThan(50);
  expect(first).toEqual(expected);
  first[0].good.push("変更");
  first[0].month = 99;
  expect(getMonthlySummary(2030, 3)).toEqual(expected);
});
const allOffices = [
  "016000",
  "040000",
  "150000",
  "130000",
  "230000",
  "270000",
  "340000",
  "390000",
  "400000",
  "471000",
];
// 2026-11-19 は中宮九紫。北＝五黄殺、東＝日破、南＝暗剣殺。
const boardDay = new Date("2026-11-19T12:00:00+09:00");
it("地図と表を描画し、ホームのISRを保つ", async () => {
  const all = allOffices.map((code) => office(code, "17", ["12", "23"]));
  const data = parseNationalWeather(all, now)!;
  const html = renderToStaticMarkup(<NationalWeatherCards data={data} />);
  const svgs = html.match(/<svg[\s\S]*?<\/svg>/g)!;
  expect(svgs).toHaveLength(2);
  const [svg, narrow] = svgs;
  expect(narrow).toContain("md:hidden");
  expect(svg).toContain("md:block");
  expect(narrow).not.toContain("☂");
  // 狭い画面（390px、カードの内側 p-4）でも札の文字が 14px 以上に見える。
  expect(
    (narrowFontSize * (390 - 32)) / narrowViewBox.width,
  ).toBeGreaterThanOrEqual(14);
  expect(Buffer.byteLength(html)).toBeLessThan(40000);
  expect(svg).toContain("今日の全国の天気の地図");
  expect(svg.match(/<circle /g)).toHaveLength(10);
  expect(Buffer.byteLength(svg)).toBeLessThan(60000);
  for (const city of data.cities) expect(html).toContain(city.city);
  expect(html.match(/scope="row"/g)).toHaveLength(20);
  expect(html).toContain("<details");
  expect(html).toContain("10都市の今日の天気（表）");
  expect(html).not.toContain("/houi/today?pref=");
  // 地図とあわせて 2 つの表を持っても、HTML が重くなりすぎない。
  expect(renderToStaticMarkup(<NationalWeatherCards data={null} />)).toContain(
    "いま天気を取得できません。",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(all)),
  );
  const section = renderToStaticMarkup(await TodayOverview());
  expect(section).toContain("今日の天気と方位");
  expect(section).not.toContain("<form");
  expect(section).not.toContain("<input");
  expect(section).not.toContain("<script");
  expect(section).toContain("Natural Earth");
  const home = readFileSync("src/app/page.tsx", "utf8");
  expect(home).not.toContain("searchParams");
  expect(home).toContain("<TodayOverview />");
  expect(home).toMatch(/export const revalidate = 60/);
  const source = readFileSync("src/components/home/TodayOverview.tsx", "utf8");
  expect(source).not.toMatch(/^"use client"/m);
});
it("東京から見た方位は気学の伝統的な区切りで、共通の凶の都市を赤くする", () => {
  expect(
    Object.fromEntries(
      Object.keys(mapCities).map((code) => [code, directionFromTokyo(+code)]),
    ),
  ).toEqual({
    1: "N",
    4: "NE",
    13: null,
    15: "N",
    23: "W",
    27: "SW",
    34: "W",
    39: "SW",
    40: "W",
    47: "SW",
  });
  const board = buildTodayBoard(boardDay);
  expect(board.center).toBe(9);
  expect(board.common).toEqual([
    { direction: "N", label: "北", reason: "五黄殺" },
    { direction: "E", label: "東", reason: "日破" },
    { direction: "S", label: "南", reason: "暗剣殺" },
  ]);
  expect(board.stars).toHaveLength(9);
  expect(board.stars[0]).toMatchObject({
    name: "一白水星",
    lucky: ["NE", "SW"],
  });
  const all = allOffices.map((code) => office(code, "17", ["12", "23"]));
  const data = parseNationalWeather(all, now)!;
  const directions = cityDirectionsFor(data, board);
  expect(directions[1]).toEqual({ label: "北", unlucky: "五黄殺" });
  expect(directions[15]).toEqual({ label: "北", unlucky: "五黄殺" });
  expect(directions[4]).toEqual({ label: "北東" });
  expect(directions[13]).toBeUndefined();
  // 南西の代表は東京に近い順（大阪・高知・那覇）。
  expect(
    citiesByDirection(data)
      .get("SW")!
      .map((city) => city.city),
  ).toEqual(["大阪", "高知", "那覇"]);
  const html = renderToStaticMarkup(
    <TodayOverviewCard data={data} board={board} />,
  );
  // 本命星の表 9 行と都市の表 10 行（畳んだ短い表と lg 以上の全文の表）。
  expect(html.match(/scope="row"/g)).toHaveLength(29);
  expect(html).toContain("地図では札幌・新潟を赤くしています。");
  expect(html).toContain("北・五黄殺");
  expect(html).toContain("#ffe4e6");
  expect(html).toContain("南西 大阪☀️— ほか2");
  expect(html).toContain("地図の都市なし");
  const empty = renderToStaticMarkup(
    <TodayOverviewCard data={null} board={board} />,
  );
  expect(empty).toContain("いま天気を取得できません。");
  expect(empty).toContain("今日の日盤（東京基準）");
});
it("狭い画面の短い天気", () => {
  expect(
    [
      "くもり 時々 雪か雨",
      "雨 所により 雷を伴う",
      "晴れ 朝晩 くもり",
      "くもり のち 晴れ",
      "雪",
      "大雨",
    ].map(shortWeather),
  ).toEqual(["くもり時々雪", "雨", "晴れ", "くもりのち晴れ", "雪", "大雨"]);
});
it("天気の先頭と座標、カード配置", () => {
  expect(
    ["晴れ 時々 雨", "くもり", "曇り", "雨", "雪", "不明"].map(weatherEmoji),
  ).toEqual(["☀️", "☁️", "☁️", "🌧️", "❄️", ""]);
  const naha = project(127.68, 26.21);
  expect(naha.x).toBeGreaterThan(insetBox.x);
  expect(naha.x).toBeLessThan(insetBox.x + insetBox.width);
  expect(naha.y).toBeGreaterThan(insetBox.y);
  expect(naha.y).toBeLessThan(insetBox.y + insetBox.height);
  expect(project(139.69, 35.69).x).toBeGreaterThan(project(135.5, 34.69).x);
  const cards = Object.values(mapCities);
  for (const [i, a] of cards.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + cardSize.width).toBeLessThanOrEqual(mapViewBox.width);
    expect(a.y + cardSize.height).toBeLessThanOrEqual(mapViewBox.height);
    for (const b of cards.slice(i + 1))
      expect(
        a.x + cardSize.width <= b.x ||
          b.x + cardSize.width <= a.x ||
          a.y + cardSize.height <= b.y ||
          b.y + cardSize.height <= a.y,
      ).toBe(true);
  }
});

it("狭い地図の札は重ならず、文字色は背景と十分に区別できる", () => {
  for (const city of Object.values(mapCities)) {
    const point = project(city.lon, city.lat);
    for (const box of Object.values(mapCities))
      expect(
        point.x < box.x ||
          point.x > box.x + cardSize.width ||
          point.y < box.y ||
          point.y > box.y + cardSize.height,
      ).toBe(true);
    const x = 101 + point.x * 0.31;
    const y = 74 + point.y * 0.31;
    for (const box of Object.values(narrowCities))
      expect(
        x < box.x ||
          x > box.x + narrowCardSize.width ||
          y < box.y ||
          y > box.y + narrowCardSize.height,
      ).toBe(true);
  }
  const cards = Object.values(narrowCities);
  for (const [i, a] of cards.entries()) {
    expect(a.x + narrowCardSize.width).toBeLessThanOrEqual(narrowViewBox.width);
    expect(a.y + narrowCardSize.height).toBeLessThanOrEqual(
      narrowViewBox.height,
    );
    for (const b of cards.slice(i + 1))
      expect(
        a.x + narrowCardSize.width <= b.x ||
          b.x + narrowCardSize.width <= a.x ||
          a.y + narrowCardSize.height <= b.y ||
          b.y + narrowCardSize.height <= a.y,
      ).toBe(true);
  }
  const luminance = (hex: string) => {
    const channels = hex.match(/[0-9a-f]{2}/g)!.map((value) => {
      const c = parseInt(value, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  for (const foreground of ["#172f2a", "#243f39", "#9f1239"])
    for (const background of [
      "#fff3d6",
      "#e2efff",
      "#e8f4f7",
      "#f0f1ed",
      "#ffe4e6",
    ])
      expect(
        (luminance(background) + 0.05) / (luminance(foreground) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
});
