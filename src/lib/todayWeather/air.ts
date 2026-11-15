/**
 * 空気（PM2.5）の予報。Open-Meteo Air Quality API（認証なし、CAMS のモデル値）を使う。
 * https://open-meteo.com/en/docs/air-quality-api
 * 実測ではなくモデルの推定・予報なので、画面では「参考値」と書く。
 * 色で良し悪しを付けない（緑と赤は方位の判定にだけ使う約束）。基準との比較は文字で出す。
 */
import { fetchJson } from "./fetchJson";
import type { Prefecture } from "./prefectures";

export const AIR_REVALIDATE_SECONDS = 3600;
/**
 * Open-Meteo の無料 API は非商用向け（データは CC BY 4.0、出典表記が要る）。
 * 利用条件の判断で止めるときは false にする。止めると空気の枠は「いま取得できません」になる。
 */
export const AIR_SOURCE_ENABLED = true;
/** WHO 2021 指針の 24 時間平均（µg/m³） */
export const WHO_PM25_24H = 15;
/** 日本の環境基準の日平均値（µg/m³） */
export const JAPAN_PM25_DAILY = 35;

export const airQualityUrl = (pref: Pick<Prefecture, "lat" | "lon">) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${pref.lat}&longitude=${pref.lon}&current=pm2_5&hourly=pm2_5&timezone=Asia%2FTokyo&forecast_days=2`;

export type AirSummary = {
  /** 発表時刻（日本時間、YYYY-MM-DDTHH:mm） */
  time: string;
  current: number;
  /** 今日（日本時間）の 1 時間値の平均と最大。モデル値。 */
  todayMean?: number;
  todayMax?: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function parseAirQuality(json: unknown): AirSummary | null {
  if (!json || typeof json !== "object") return null;
  const data = json as {
    current?: { time?: unknown; pm2_5?: unknown };
    hourly?: { time?: unknown; pm2_5?: unknown };
  };
  const current = data.current?.pm2_5;
  const time = data.current?.time;
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  if (typeof time !== "string") return null;
  const today = time.slice(0, 10);
  const times = data.hourly?.time;
  const values = data.hourly?.pm2_5;
  const todayValues: number[] = [];
  if (Array.isArray(times) && Array.isArray(values)) {
    times.forEach((t, i) => {
      const v = values[i];
      if (typeof t === "string" && t.startsWith(today) && typeof v === "number")
        todayValues.push(v);
    });
  }
  const summary: AirSummary = { time, current: round1(current) };
  if (todayValues.length > 0) {
    summary.todayMean = round1(
      todayValues.reduce((a, b) => a + b, 0) / todayValues.length,
    );
    summary.todayMax = round1(Math.max(...todayValues));
  }
  return summary;
}

/** 基準との比較を文字で。安全とは言い切らない。 */
export function pm25Note(mean: number): string {
  if (mean <= WHO_PM25_24H)
    return `WHO指針（24時間平均${WHO_PM25_24H}µg/m³）以下の見込み`;
  if (mean <= JAPAN_PM25_DAILY)
    return `WHO指針（${WHO_PM25_24H}）は上回り、国の環境基準（日平均${JAPAN_PM25_DAILY}µg/m³）以下の見込み`;
  return `国の環境基準（日平均${JAPAN_PM25_DAILY}µg/m³）を上回る見込み`;
}

export async function getAirQuality(
  pref: Prefecture,
  fetchImpl?: typeof fetch,
): Promise<AirSummary | null> {
  if (!AIR_SOURCE_ENABLED) return null;
  const json = await fetchJson(
    airQualityUrl(pref),
    AIR_REVALIDATE_SECONDS,
    fetchImpl,
  );
  return json === null ? null : parseAirQuality(json);
}
