import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseAmedasMinimum,
  getAmedasMinimum,
} from "@/lib/todayWeather/amedas";
import { __resetFetchJsonCacheForTest } from "@/lib/todayWeather/fetchJson";
import {
  CITY_ORIGINS,
  resolveOrigin,
  coordinateOrigin,
  TOKYO_ORIGIN,
  arbitrageHref,
} from "@/lib/todayWeather/origin";
import { directionFromOrigin } from "@/lib/todayWeather/cityDirections";
import {
  buildTodayBoard,
  buildTodayDirections,
  buildCurrentDirections,
} from "@/lib/todayDirections";
import { cityDirectionsFor } from "@/components/home/TodayOverview";
import {
  formatTemps,
  NationalWeatherTable,
} from "@/components/home/NationalWeather";
import { OriginLinks } from "@/components/home/OriginLinks";
import type { NationalWeather } from "@/lib/todayWeather/national";

const now = new Date("2026-11-20T06:20:00+09:00");
afterEach(() => {
  vi.useRealTimers();
  __resetFetchJsonCacheForTest();
});
it("アメダスは当日0時以降・現在までの品質0だけを採る", () => {
  expect(
    parseAmedasMinimum(
      {
        "20261119235000": { temp: [-9, 0] },
        "20261120000000": { temp: [4.2, 0] },
        "20261120001000": { temp: [null, 0] },
        "20261120002000": { temp: [-8, 1] },
        "20261120003000": {},
        "20261120004000": { temp: ["-8", 0] },
        "20261120005000": { temp: [2.6, 0] },
        "20261120062000": { temp: [3.1, 0] },
        "20261120063000": { temp: [-7, 0] },
        "20261121000000": { temp: [-10, 0] },
      },
      now,
    ),
  ).toBe(2.6);
  expect(parseAmedasMinimum(null, now)).toBeUndefined();
  expect(
    parseAmedasMinimum({ "20261120000000": { temp: [null, 8] } }, now),
  ).toBeUndefined();
});
it("当日のブロックをキャッシュし、一部失敗でも観測最低を整数で返す", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("_03.json")) throw new Error("timeout");
    return {
      ok: true,
      json: async () => ({ "20261120000000": { temp: [2.6, 0] } }),
    } as Response;
  });
  expect(await getAmedasMinimum("44132", now, fetcher as typeof fetch)).toBe(3);
  expect(fetcher.mock.calls.map(([url]) => url.split("/").pop())).toEqual([
    "20261120_00.json",
    "20261120_03.json",
    "20261120_06.json",
  ]);
});
it("最高だけ・最低だけ・明日フォールバックを区別し、表の今日列にも使う", () => {
  expect(formatTemps({ max: 16 }, { max: 20, min: 8 }, "range")).toBe(
    "最高16℃",
  );
  expect(formatTemps({ max: 16 }, undefined, "compact")).toBe("16℃");
  expect(formatTemps({ min: 6 }, { max: 20, min: 8 }, "range")).toBe("最低6℃");
  expect(formatTemps({}, { max: 20, min: 8 }, "range")).toBe("明日20/8℃");
  const data: NationalWeather = {
    reportDatetime: now.toISOString(),
    cities: [
      {
        city: "東京",
        areaName: "東京",
        prefectureCode: 13,
        today: { date: "2026-11-20", weather: "晴れ", max: 16, min: 3 },
      },
    ],
  };
  expect(
    renderToStaticMarkup(<NationalWeatherTable data={data} />).match(
      /16℃\/3℃/g,
    ),
  ).toHaveLength(2);
  data.cities[0].today.min = undefined;
  expect(
    renderToStaticMarkup(<NationalWeatherTable data={data} />).match(
      /最高16℃/g,
    ),
  ).toHaveLength(2);
});
it("クエリが登録地より優先し、同じ日盤のまま方位と真太陽時が変わる", () => {
  const registered = {
    lat: 34.7,
    lon: 135.5,
    name: "登録地",
    slug: "registered",
  };
  const nagoya = resolveOrigin("nagoya", registered);
  expect(nagoya.code).toBe(23);
  expect(resolveOrigin("registered", registered)).toBe(registered);
  expect(resolveOrigin(undefined, registered)).toBe(registered);
  expect(resolveOrigin("invalid")).toBe(TOKYO_ORIGIN);
  expect(directionFromOrigin(23, nagoya)).toBeNull();
  expect(directionFromOrigin(13, nagoya)).toBe("E");
  expect(
    directionFromOrigin(13, { ...TOKYO_ORIGIN, lat: TOKYO_ORIGIN.lat + 0.01 }),
  ).toBeNull();
  const tokyoHours = buildTodayDirections(now, TOKYO_ORIGIN.lon);
  const nagoyaHours = buildTodayDirections(now, nagoya.lon);
  expect(nagoyaHours.center).toBe(tokyoHours.center);
  expect(nagoyaHours.stars[0].hours[0].time).not.toBe(
    tokyoHours.stars[0].hours[0].time,
  );
  expect(buildCurrentDirections(now, undefined, nagoya.lon).start).not.toBe(
    buildCurrentDirections(now).start,
  );
  const tokyoStart = new Date(
    buildCurrentDirections(now, undefined, TOKYO_ORIGIN.lon).start,
  ).getTime();
  const nagoyaStart = new Date(
    buildCurrentDirections(now, undefined, nagoya.lon).start,
  ).getTime();
  const boundary = new Date((tokyoStart + nagoyaStart) / 2);
  expect(
    buildCurrentDirections(boundary, undefined, nagoya.lon).branch,
  ).not.toBe(
    buildCurrentDirections(boundary, undefined, TOKYO_ORIGIN.lon).branch,
  );
  const data: NationalWeather = {
    reportDatetime: now.toISOString(),
    cities: [
      {
        city: "名古屋",
        areaName: "愛知",
        prefectureCode: 23,
        today: { date: "2026-11-20", weather: "晴れ" },
      },
    ],
  };
  expect(cityDirectionsFor(data, buildTodayBoard(now), nagoya)[23]).toEqual({
    label: "起点",
  });
  const html = renderToStaticMarkup(
    <OriginLinks origin={nagoya} registered={registered} />,
  );
  expect(html).toContain('href="/?from=nagoya" aria-current="location"');
  for (const city of CITY_ORIGINS)
    expect(html).toContain(`/?from=${city.slug}`);
  expect(html).toContain("登録地：登録地");
  expect(arbitrageHref(nagoya)).toContain(
    `baseLat=${nagoya.lat}&baseLon=${nagoya.lon}`,
  );
});
it("URL座標は空値・範囲外・部分的な数値を受けない", () => {
  for (const [lat, lon] of [
    ["", "0"],
    ["91", "139"],
    ["35", "181"],
    ["35evil", "139"],
    ["NaN", "139"],
  ])
    expect(coordinateOrigin(lat, lon)).toBeUndefined();
  expect(coordinateOrigin("0", "0")).toMatchObject({ lat: 0, lon: 0 });
});
