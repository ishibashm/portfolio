/**
 * 「A市から見て各方位にどんな街があり、相場はいくらか」を組み立てる。
 *
 * 方位は出発地からの向きで決まるので、市区町村どうしの位置関係は固定であり
 * 静的ページとして成立する。ここに載せるのは自前で集計した相場と方位判定だけで、
 * 物件そのものの情報は載せない（掲載元の情報をそのまま転載しないため）。
 */
import raw from "@/data/areaDirections.json";
import {
  bearingBetween,
  distanceKmBetween,
  directionFromBearing,
} from "@/utils/directionGeo";
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
    const distanceKm = distanceKmBetween(origin.lat, origin.lon, a.lat, a.lon);
    if (distanceKm < MIN_KM || distanceKm > MAX_KM) continue;
    const bearing = bearingBetween(origin.lat, origin.lon, a.lat, a.lon);
    // エリアページは気学の伝統区分（四正30度・四隅60度）で切る。
    const direction = directionFromBearing(bearing, "traditional");
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

/** 県ごとにまとめる。県内は掲載数が多い順。 */
export function areasByPref(): Map<string, Area[]> {
  const out = new Map<string, Area[]>();
  for (const a of AREAS) {
    if (!out.has(a.pref)) out.set(a.pref, []);
    out.get(a.pref)!.push(a);
  }
  for (const list of out.values()) list.sort((x, y) => y.count - x.count);
  return out;
}

/**
 * 記事ページに置く出発地の候補。
 *
 * 全 220 件を毎ページに並べるとリンクが薄まるうえ本文が読めなくなるので、
 * 県ごとに掲載数の多い数件だけを出し、残りは一覧ページへ送る。
 * 県を落とさないのは、掲載数順に上から取ると大阪・愛知だけで埋まってしまい、
 * 鳥取や福井から来た人に入口が無くなるため。
 */
export function topAreasByPref(perPref = 3): [string, Area[]][] {
  return [...areasByPref().entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pref, list]) => [pref, list.slice(0, perPref)] as [string, Area[]]);
}

/**
 * 同じ県内のほかのエリア。
 *
 * 方位別の一覧は 5〜150km の範囲で切っているため、県内でも遠い相手や
 * 近すぎる同一市内の区は載らない。県で辿れる道を別に用意する。
 */
export function siblingAreas(origin: Area, limit = 24): Area[] {
  return AREAS.filter((a) => a.pref === origin.pref && a.code !== origin.code)
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}
