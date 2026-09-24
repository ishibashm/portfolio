import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import type { DayKigakuCell } from "@/lib/dayKigakuClient";

/** Shared by SpotVerdict and server save. The board itself remains computeDayKigaku. */
export function evaluateSpot(
  baseLat: number,
  baseLon: number,
  lat: number,
  lon: number,
  classical: boolean,
  board?: Record<
    string,
    | Pick<DayKigakuCell, "tier" | "blocked" | "doyouSatsu">
    | { tier: string; blocked: boolean; doyouSatsu?: boolean }
  >,
) {
  const distanceKm = distanceKmBetween(baseLat, baseLon, lat, lon);
  if (distanceKm === 0) return null;
  const bearingDeg = bearingBetween(baseLat, baseLon, lat, lon);
  const direction = directionFromBearing(
    bearingDeg,
    classical ? "traditional" : "physical",
  );
  return { bearingDeg, direction, distanceKm, cell: board?.[direction] };
}
