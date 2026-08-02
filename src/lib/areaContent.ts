/**
 * 「A市から見て各方位にどんな街があり、相場はいくらか」を組み立てる。
 *
 * 方位は出発地からの向きで決まるので、市区町村どうしの位置関係は固定であり
 * 静的ページとして成立する。ここに載せるのは自前で集計した相場と方位判定だけで、
 * 物件そのものの情報は載せない（掲載元の情報をそのまま転載しないため）。
 */
import raw from "@/data/areaDirections.json";
import {
  getBearing,
  getDistance,
  getDirectionFromBearing,
} from "@/lib/geoDirection";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  type CompassDirection,
} from "@/lib/kigakuContent";

export interface Area {
  code: string;
  pref: string;
  city: string;
  full: string;
  lat: number;
  lon: number;
  count: number;
  sqmRent: number;
  medianRent: number;
}

const dataset = raw as { generatedAt: string; areas: Area[] };

export const AREAS: Area[] = dataset.areas;
export const AREA_GENERATED_AT: string = dataset.generatedAt;

const byCode = new Map(AREAS.map((a) => [a.code, a]));
export function findArea(code: string): Area | undefined {
  return byCode.get(code);
}

export interface NeighbourArea extends Area {
  distanceKm: number;
  bearing: number;
  direction: CompassDirection;
  /** 出発地の相場に対する差（%）。負なら安い */
  rentDiffPct: number;
}

/** 近すぎる相手は方位が定まらないので除く。同一市内の区など。 */
const MIN_KM = 5;
/** 引越し先として現実的な範囲に絞る */
const MAX_KM = 150;

export function neighboursByDirection(
  origin: Area,
): Record<CompassDirection, NeighbourArea[]> {
  const out = {} as Record<CompassDirection, NeighbourArea[]>;
  for (const d of DIRECTIONS) out[d] = [];

  for (const a of AREAS) {
    if (a.code === origin.code) continue;
    const distanceKm = getDistance(origin.lat, origin.lon, a.lat, a.lon);
    if (distanceKm < MIN_KM || distanceKm > MAX_KM) continue;
    const bearing = getBearing(origin.lat, origin.lon, a.lat, a.lon);
    const direction = getDirectionFromBearing(bearing) as CompassDirection;
    if (!out[direction]) continue; // CENTER は返らないが型のため
    out[direction].push({
      ...a,
      distanceKm: Math.round(distanceKm),
      bearing: Math.round(bearing),
      direction,
      rentDiffPct: Math.round(((a.sqmRent - origin.sqmRent) / origin.sqmRent) * 100),
    });
  }

  for (const d of DIRECTIONS) {
    out[d].sort((x, y) => x.distanceKm - y.distanceKm);
  }
  return out;
}

export function directionLabel(d: CompassDirection): string {
  return DIRECTION_LABELS[d];
}

/** 出発地の候補として出すエリア（掲載数が多い順） */
export function topAreas(limit = 60): Area[] {
  return [...AREAS].sort((a, b) => b.count - a.count).slice(0, limit);
}
