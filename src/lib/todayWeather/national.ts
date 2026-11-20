import { getAmedasMinimum } from "./amedas";
import { todayInJapan } from "@/utils/japanDate";
import { fetchJson } from "./fetchJson";
import {
  JMA_REVALIDATE_SECONDS,
  jmaForecastUrl,
  parseJmaForecast,
  type JmaDay,
} from "./jma";
import { PREFECTURES } from "./prefectures";

export type NationalCityWeather = {
  city: string;
  areaName: string;
  prefectureCode: number;
  today: JmaDay;
  tomorrow?: JmaDay;
  pop?: number;
};
export type NationalWeather = {
  cities: NationalCityWeather[];
  reportDatetime: string;
};
const codes = [1, 4, 15, 13, 23, 27, 34, 39, 40, 47];

/** 全国ファイルの areas は単一の区域なので、府県予報と共通の読み取りに渡す。 */
export function parseNationalWeather(
  json: unknown,
  now = new Date(),
): NationalWeather | null {
  if (!Array.isArray(json)) return null;
  const cities: NationalCityWeather[] = [];
  let reportDatetime = "";
  for (const code of codes) {
    const pref = PREFECTURES.find((p) => p.code === code)!;
    const entry = json.find((item) => item && item.officeCode === pref.office);
    const report = entry?.srf;
    if (!report || !Array.isArray(report.timeSeries)) continue;
    const timeSeries = report.timeSeries.map((series: unknown) => {
      if (!series || typeof series !== "object") return {};
      const s = series as { timeDefines?: unknown; areas?: unknown };
      return {
        timeDefines: Array.isArray(s.timeDefines) ? s.timeDefines : [],
        areas:
          s.areas && typeof s.areas === "object" && !Array.isArray(s.areas)
            ? [s.areas]
            : [],
      };
    });
    const forecast = parseJmaForecast([{ ...report, timeSeries }], pref);
    if (
      !forecast ||
      typeof forecast.areaName !== "string" ||
      forecast.days.some(
        (day) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
          !Number.isFinite(Date.parse(day.date)),
      )
    )
      continue;
    const [today, tomorrow] = forecast.days;
    const pops = forecast.pops.filter(
      (p) =>
        p.date === today.date &&
        new Date(`${p.date}T00:00:00+09:00`).getTime() + p.endHour * 3600000 >
          now.getTime(),
    );
    cities.push({
      city: pref.city,
      areaName: forecast.areaName,
      prefectureCode: code,
      today,
      tomorrow,
      ...(pops.length ? { pop: Math.max(...pops.map((p) => p.pop)) } : {}),
    });
    if (
      typeof forecast.reportDatetime === "string" &&
      Number.isFinite(Date.parse(forecast.reportDatetime)) &&
      (!reportDatetime ||
        Date.parse(forecast.reportDatetime) > Date.parse(reportDatetime))
    )
      reportDatetime = forecast.reportDatetime;
  }
  return cities.length ? { cities, reportDatetime } : null;
}

export async function getNationalWeather(
  fetchImpl?: typeof fetch,
): Promise<NationalWeather | null> {
  const json = await fetchJson(
    jmaForecastUrl("010000"),
    JMA_REVALIDATE_SECONDS,
    fetchImpl,
  );
  const now = new Date();
  const data = parseNationalWeather(json, now);
  if (!data) return null;
  const results = await Promise.allSettled(
    data.cities.map(async (city) => {
      if (city.today.min !== undefined || city.today.date !== todayInJapan(now))
        return city;
      const pref = PREFECTURES.find((p) => p.code === city.prefectureCode)!;
      const min = await getAmedasMinimum(pref.amedas, now, fetchImpl);
      if (
        min === undefined ||
        (city.today.max !== undefined && min >= city.today.max)
      )
        return city;
      return { ...city, today: { ...city.today, min } };
    }),
  );
  return {
    ...data,
    cities: results.map((result, i) =>
      result.status === "fulfilled" ? result.value : data.cities[i],
    ),
  };
}
