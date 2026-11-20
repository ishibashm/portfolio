/** 地図の代表都市が、選んだ起点から見てどの方位にあるか。 */
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
  return directionFromOrigin(code, mapCities[TOKYO_CODE]);
}

export function distanceFromTokyo(code: number): number {
  return distanceFromOrigin(code, mapCities[TOKYO_CODE]);
}

export function distanceFromOrigin(
  code: number,
  origin: { lat: number; lon: number },
): number {
  const city = mapCities[code];
  return city
    ? distanceKmBetween(origin.lat, origin.lon, city.lat, city.lon)
    : Infinity;
}
export function directionFromOrigin(
  code: number,
  origin: { lat: number; lon: number },
): CompassDirection | null {
  const city = mapCities[code];
  if (!city || distanceFromOrigin(code, origin) < 15) return null;
  return directionFromBearing(
    bearingBetween(origin.lat, origin.lon, city.lat, city.lon),
    "traditional",
  );
}
