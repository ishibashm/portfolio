/** 地図の代表都市が、東京から見てどの方位にあるか。 */
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
  type CompassDirection,
} from "@/utils/directionGeo";
import { mapCities } from "./mapProjection";

export const TOKYO_CODE = 13;

/**
 * 気学の伝統的な区切り（四正 30 度・四隅 60 度）で、真北を基準にする。
 * 今日の吉方位（古典の日盤）と同じ規則なので、表と地図の方位が食い違わない。
 * 東京そのものは起点なので方位を持たない。
 */
export function directionFromTokyo(code: number): CompassDirection | null {
  const city = mapCities[code];
  const tokyo = mapCities[TOKYO_CODE];
  if (!city || code === TOKYO_CODE) return null;
  return directionFromBearing(
    bearingBetween(tokyo.lat, tokyo.lon, city.lat, city.lon),
    "traditional",
  );
}

export function distanceFromTokyo(code: number): number {
  const city = mapCities[code];
  const tokyo = mapCities[TOKYO_CODE];
  if (!city) return Number.POSITIVE_INFINITY;
  return distanceKmBetween(tokyo.lat, tokyo.lon, city.lat, city.lon);
}
