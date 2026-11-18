/**
 * 気象庁の府県天気予報（JSON）を読む。
 * https://www.jma.go.jp/bosai/forecast/data/forecast/{office}.json
 * 出典の表記は「出典：気象庁」とし、気象庁の天気予報ページへリンクする。
 */
import type { Prefecture } from "./prefectures";

export const JMA_REVALIDATE_SECONDS = 1800;

export const jmaForecastUrl = (office: string) =>
  `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`;
export type JmaDay = {
  /** YYYY-MM-DD（日本時間） */
  date: string;
  weather: string;
  max?: number;
  min?: number;
};
export type JmaPop = {
  date: string;
  /** 開始の時（0〜23） */
  startHour: number;
  endHour: number;
  pop: number;
};
export type JmaForecast = {
  publishingOffice: string;
  reportDatetime: string;
  areaName: string;
  days: JmaDay[];
  pops: JmaPop[];
};

type Area = { area?: { code?: string; name?: string }; [key: string]: unknown };
type TimeSeries = { timeDefines?: string[]; areas?: Area[] };
type Report = {
  publishingOffice?: string;
  reportDatetime?: string;
  timeSeries?: TimeSeries[];
};

const datePart = (iso: string) => iso.slice(0, 10);
const hourPart = (iso: string) => Number(iso.slice(11, 13));
/** 気象庁の天気文は単語を全角空白で区切っている。半角の空白1つにそろえる。 */
const tidyWeather = (text: string) => text.replace(/[\u3000\s]+/g, " ").trim();
const toNumber = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

function pickArea(series: TimeSeries | undefined, code: string) {
  const areas = series?.areas ?? [];
  return areas.find((a) => a.area?.code === code) ?? areas[0];
}

/** 府県天気予報の 1 本目（今日・明日・明後日）から、代表地点の分を取り出す。 */
export function parseJmaForecast(
  json: unknown,
  pref: Pick<Prefecture, "area" | "amedas">,
  maxDays = 2,
): JmaForecast | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const report = json[0] as Report;
  const series = report.timeSeries;
  if (!Array.isArray(series) || series.length === 0) return null;

  const weatherSeries = series[0];
  const weatherArea = pickArea(weatherSeries, pref.area);
  const weathers = weatherArea?.weathers;
  const defines = weatherSeries?.timeDefines;
  if (!Array.isArray(weathers) || !Array.isArray(defines)) return null;

  const days: JmaDay[] = [];
  defines.slice(0, maxDays).forEach((iso, i) => {
    const text = weathers[i];
    if (typeof iso === "string" && typeof text === "string")
      days.push({ date: datePart(iso), weather: tidyWeather(text) });
  });
  if (days.length === 0) return null;

  // 降水確率（6時間ごと）
  const popSeries = series[1];
  const popArea = pickArea(popSeries, pref.area);
  const pops: JmaPop[] = [];
  const popValues = popArea?.pops;
  if (Array.isArray(popValues) && Array.isArray(popSeries?.timeDefines)) {
    popSeries.timeDefines.forEach((iso, i) => {
      const pop = toNumber(popValues[i]);
      if (typeof iso !== "string" || pop === undefined) return;
      const startHour = hourPart(iso);
      pops.push({
        date: datePart(iso),
        startHour,
        endHour: startHour + 6,
        pop,
      });
    });
  }

  // 気温（00時の値はその日の最低、09時の値はその日の最高）
  const tempSeries = series[2];
  const tempArea = pickArea(tempSeries, pref.amedas);
  const temps = tempArea?.temps;
  if (Array.isArray(temps) && Array.isArray(tempSeries?.timeDefines)) {
    tempSeries.timeDefines.forEach((iso, i) => {
      const value = toNumber(temps[i]);
      if (typeof iso !== "string" || value === undefined) return;
      const day = days.find((d) => d.date === datePart(iso));
      if (!day) return;
      if (hourPart(iso) >= 9) day.max = value;
      else day.min = value;
    });
    // 朝の発表では「今日の最低」の欄に日中の最高が入ることがある。同じ値なら最低は出さない。
    for (const day of days)
      if (day.min !== undefined && day.min === day.max) delete day.min;
  }

  return {
    publishingOffice: report.publishingOffice ?? "",
    reportDatetime: report.reportDatetime ?? "",
    areaName: weatherArea?.area?.name ?? "",
    days,
    pops,
  };
}
