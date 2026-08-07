import {
  AstroEngine,
  getYearStar,
  getMonthStar,
  getDayStar,
} from "@/utils/ephemerisEngine";

/**
 * 履歴グラフに出す値。
 *
 * 履歴タブのグラフは 17 系列を描こうとしていたが、API が返していたのは
 * kpIndex と magneticF の 2 つだけで、残りは保存先すら無かった。
 * 実測（本番 API）では 5 つのグラフのうち 3 つが完全に空だった。
 *
 * ただし、そのうち大半は「その日付から決まる値」で、保存する必要がない。
 *   - 天体黄経（太陽・月・木星・交点）
 *   - 九星（年盤・月盤・日盤）は木星黄経と暦から決まる
 *   - 月相の照度は太陽と月の離角から決まる
 *   - 地磁気は地磁気モデル（WMM）と地点・日付から決まる
 * これらは記録した行の日付から後から計算できる。過去分の穴埋めも要らない。
 *
 * 逆に「その時刻に観測しないと分からない」のは太陽活動だけ。
 *   - kpIndex（磁気嵐指数）
 *   - xrayFlux（X線フラックス）
 * こちらは記録する（TelemetryLog.kpIndex と metadata）。
 */

/** 地磁気の基準地点。既存の記録（F≒52138nT）と揃えるため東京。 */
export const TELEMETRY_REFERENCE = { lat: 35.6895, lon: 139.6917 };

export interface DeterministicTelemetry {
  sunLon: number;
  moonLon: number;
  jupiterLon: number;
  lunarNode: number;
  yearStar: number;
  monthStar: number;
  dayStar: number;
  /** 月の照度 0〜100 (%)。 */
  lunarIllumination: number;
}

/** 日付だけで決まる値。 */
export function computeDeterministicTelemetry(
  date: Date,
): DeterministicTelemetry {
  const sunLon = AstroEngine.getSolarLongitude(date);
  const moonLon = AstroEngine.getLunarLongitude(date);

  return {
    sunLon,
    moonLon,
    jupiterLon: AstroEngine.getJupiterLongitude(date),
    lunarNode: AstroEngine.getLunarNodeLongitude(date),
    yearStar: getYearStar(date),
    monthStar: getMonthStar(date),
    dayStar: getDayStar(date),
    lunarIllumination: lunarIlluminationPercent(sunLon, moonLon),
  };
}

/**
 * 月の照度。太陽と月の離角から求める。
 * 離角 0°（新月）で 0%、180°（満月）で 100%。
 */
export function lunarIlluminationPercent(
  sunLon: number,
  moonLon: number,
): number {
  const elongation = (((moonLon - sunLon) % 360) + 360) % 360;
  const rad = (elongation * Math.PI) / 180;
  return ((1 - Math.cos(rad)) / 2) * 100;
}

/**
 * NOAA の X 線フラックスは "C1.2" のような等級文字列で来る。
 * グラフに載せるため W/m² の数値にする。
 *   A=1e-8 B=1e-7 C=1e-6 M=1e-5 X=1e-4 を係数倍する。
 */
export function parseXrayFlux(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "") return null;

  // すでに数値ならそのまま
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && !/^[A-Za-z]/.test(raw)) return asNumber;

  const m = /^([ABCMX])\s*([\d.]+)?$/i.exec(raw);
  if (!m) return null;
  const base: Record<string, number> = {
    A: 1e-8,
    B: 1e-7,
    C: 1e-6,
    M: 1e-5,
    X: 1e-4,
  };
  const mult = m[2] ? Number(m[2]) : 1;
  if (!Number.isFinite(mult)) return null;
  return base[m[1].toUpperCase()] * mult;
}
