"use server";

import { geomagneticAt, type GeomagneticData } from "@/utils/geomagneticModel";

export type { GeomagneticData };

/**
 * サーバーで偏角などを引く。計算は utils/geomagneticModel（素の関数）に
 * 1 つだけ置いてあり、ここは呼ぶだけ。
 */
export async function getGeomagneticData(
  lat: number,
  lon: number,
  timestamp: number = Date.now(),
): Promise<GeomagneticData | null> {
  return geomagneticAt(lat, lon, timestamp);
}
