/**
 * 2地点間の方位角・距離と、方位角から八方位への変換。
 *
 * 同じ実装が api/rentals/arbitrage、api/municipalities-wealth、
 * api/relocation/history に別々に置かれていた。方位の切り方が
 * ずれると同じ場所が別の方位に判定されるため、ここに寄せる。
 */
import type { Direction } from "@/utils/ephemerisEngine";

export function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const l1 = lat1 * (Math.PI / 180);
  const l2 = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x =
    Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 九星気学の八方位。四正（北・東・南・西）を 30 度、
 * 四隅（北東・南東・南西・北西）を 60 度で切る伝統的な区分。
 * 45 度ずつの等分ではない点に注意。
 */
export function getDirectionFromBearing(bearing: number): Direction {
  const b = ((bearing % 360) + 360) % 360;
  if (b >= 345 || b < 15) return "N";
  if (b < 75) return "NE";
  if (b < 105) return "E";
  if (b < 165) return "SE";
  if (b < 195) return "S";
  if (b < 255) return "SW";
  if (b < 285) return "W";
  return "NW";
}
