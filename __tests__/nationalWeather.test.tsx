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
  NationalWeatherSection,
  NationalWeatherOverview,
  weatherEmoji,
} from "@/components/home/NationalWeather";
import {
  mapCities,
  project,
  insetBox,
  cardSize,
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
it("地図と表を描画し、ホームのISRを保つ", async () => {
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
  const all = offices.map((code) => office(code, "17", ["12", "23"]));
  const data = parseNationalWeather(all, now)!;
  const html = renderToStaticMarkup(<NationalWeatherCards data={data} />);
  const svg = html.match(/<svg[\s\S]*?<\/svg>/)![0];
  expect(svg).toContain("今日の全国の天気の地図");
  expect(svg.match(/<circle /g)).toHaveLength(10);
  expect(Buffer.byteLength(svg)).toBeLessThan(60000);
  for (const city of data.cities) expect(html).toContain(city.city);
  expect(html.match(/scope="row"/g)).toHaveLength(10);
  expect(html).toContain("10都市の今日の天気（表）");
  expect(html).not.toContain("/houi/today?pref=");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(all)),
  );
  expect(renderToStaticMarkup(await NationalWeatherOverview())).toContain(
    "<svg",
  );
  const section = renderToStaticMarkup(await NationalWeatherSection());
  expect(section).not.toContain('action="/houi/today"');
  expect(section).toContain("Natural Earth");
  expect(renderToStaticMarkup(<NationalWeatherCards data={null} />)).toContain(
    "いま取得できません。",
  );
  const home = readFileSync("src/app/page.tsx", "utf8");
  expect(home).not.toContain("searchParams");
  expect(home).toMatch(/export const revalidate = 60/);
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
    expect(a.x + cardSize.width).toBeLessThanOrEqual(640);
    expect(a.y + cardSize.height).toBeLessThanOrEqual(620);
    for (const b of cards.slice(i + 1))
      expect(
        a.x + cardSize.width <= b.x ||
          b.x + cardSize.width <= a.x ||
          a.y + cardSize.height <= b.y ||
          b.y + cardSize.height <= a.y,
      ).toBe(true);
  }
});
