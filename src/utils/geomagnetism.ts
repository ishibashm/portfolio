// Public deterministic calculation: no Server Action endpoint is needed.
import { z } from "zod";

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
  const input = z
    .tuple([
      z.number().finite().min(-90).max(90),
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-8640000000000000).max(8640000000000000),
    ])
    .safeParse([lat, lon, timestamp]);
  if (!input.success) return null;
  return geomagneticAt(...input.data);
}
