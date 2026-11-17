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
} from "@/components/home/NationalWeather";
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
it("全国の表示とGETフォームをサーバーで描画し、ホームのISRを保つ", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(fixture)),
  );
  const overview = renderToStaticMarkup(await NationalWeatherOverview());
  expect(overview).toContain("/houi/today?pref=23");
  expect(overview).toContain("明日：雨");
  expect(overview).toContain("最高23℃");
  const section = renderToStaticMarkup(<NationalWeatherSection />);
  expect(section).toContain('action="/houi/today"');
  expect(section).toContain('method="get"');
  expect(section).toContain("都道府県を選ぶ");
  expect(section.match(/<option /g)).toHaveLength(48);
  expect(renderToStaticMarkup(<NationalWeatherCards data={null} />)).toContain(
    "いま取得できません。",
  );
  const source = readFileSync(
    "src/components/home/NationalWeather.tsx",
    "utf8",
  );
  expect(source).not.toContain('"use client"');
  expect(source).not.toMatch(/(green|emerald|red)-\d/);
  const home = readFileSync("src/app/page.tsx", "utf8");
  expect(home).not.toContain("searchParams");
  expect(home).toMatch(/export const revalidate = 60/);
  expect(home.indexOf("<NationalWeatherSection")).toBeGreaterThan(
    home.indexOf("</header>"),
  );
  expect(home.indexOf("<NationalWeatherSection")).toBeLessThan(
    home.indexOf("<AgentEntry"),
  );
});
