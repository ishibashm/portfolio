/**
 * 地球儀の上の方位の扇形（大圏）の中身。**描くものは持たない。**
 *
 * このサイトの方位は、出発地から見た**大圏の方位角**（bearingBetween）で
 * 決める。地図（メルカトル）に出発地から直線を引くと、それは大圏ではなく
 * **等角航路**（方位角が一定の線）になり、遠いほど大圏からずれる。
 * 境目の近くの街は、地図の直線で見ると隣の方位に入って見える。以前、
 * 地図の扇形の縁を直線で結んでいて、境目から 24km の街が扇形の外に
 * 描かれていた（#776）。地球儀はその理由を見せる。
 *
 * - 扇形の縁は大圏。destinationAtBearing で打った点で、出発地から見た
 *   方位角がちょうど境目の値になる
 * - 比べる「地図の直線」は等角航路。メルカトルの上で直線になる線
 * - 街の方位は判定と同じ（bearingBetween → directionFromBearing）。地図の
 *   直線で見た方位（等角航路の向き）と違う街を拾う
 */

import {
  COMPASS_DIRECTIONS,
  bearingBetween,
  destinationAtBearing,
  directionFromBearing,
  distanceKmBetween,
  normalizeBearing,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";
import { sectorRange } from "@/lib/threeBoardModel";

const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * 緯度経度 → 球の上の点（y が北極、経度 0 が +z、東経が +x）。
 * 半径 r の球。
 */
export function toXYZ(
  lat: number,
  lon: number,
  r = 1,
): [number, number, number] {
  const p = rad(lat);
  const l = rad(lon);
  return [
    r * Math.cos(p) * Math.sin(l),
    r * Math.sin(p),
    r * Math.cos(p) * Math.cos(l),
  ];
}

/**
 * メルカトルの上で出発地から引いた直線の向き（等角航路の方位角）。
 * 地図に定規を当てたときに読む角度。
 */
export function rhumbBearing(a: GeoPoint, b: GeoPoint): number {
  const dPsi = Math.log(
    Math.tan(Math.PI / 4 + rad(b.lat) / 2) /
      Math.tan(Math.PI / 4 + rad(a.lat) / 2),
  );
  let dLon = rad(b.lon - a.lon);
  if (Math.abs(dLon) > Math.PI) dLon -= Math.sign(dLon) * 2 * Math.PI;
  return normalizeBearing(deg(Math.atan2(dLon, dPsi)));
}

/** 等角航路（方位角 bearing 一定）を distanceKm 進んだ点 */
export function rhumbDestination(
  a: GeoPoint,
  bearing: number,
  distanceKm: number,
): GeoPoint {
  const d = distanceKm / EARTH_RADIUS_KM;
  const p1 = rad(a.lat);
  const t = rad(bearing);
  const p2 = p1 + d * Math.cos(t);
  const dPsi = Math.log(
    Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2),
  );
  const q = Math.abs(dPsi) > 1e-12 ? (p2 - p1) / dPsi : Math.cos(p1);
  const dl = (d * Math.sin(t)) / q;
  return {
    lat: deg(p2),
    lon: ((deg(rad(a.lon) + dl) + 540) % 360) - 180,
  };
}

/** 境目の線（大圏と等角航路）。出発地から rangeKm まで steps 等分 */
export interface BoundaryLine {
  /** この線が始まりの境目になる方位 */
  direction: CompassDirection;
  bearing: number;
  greatCircle: GeoPoint[];
  rhumb: GeoPoint[];
  /** 端での大圏と等角航路の離れ（km） */
  gapKm: number;
}

export function boundaryLines(
  origin: GeoPoint,
  mapping: NodeMapping,
  rangeKm: number,
  steps = 48,
): BoundaryLine[] {
  return COMPASS_DIRECTIONS.map((direction) => {
    const bearing = normalizeBearing(sectorRange(direction, mapping)[0]);
    const greatCircle: GeoPoint[] = [];
    const rhumb: GeoPoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const km = (rangeKm * i) / steps;
      greatCircle.push(
        i === 0
          ? origin
          : destinationAtBearing(origin.lat, origin.lon, bearing, km),
      );
      rhumb.push(i === 0 ? origin : rhumbDestination(origin, bearing, km));
    }
    const a = greatCircle[steps];
    const b = rhumb[steps];
    return {
      direction,
      bearing,
      greatCircle,
      rhumb,
      gapKm: distanceKmBetween(a.lat, a.lon, b.lat, b.lon),
    };
  });
}

export interface GlobeCity {
  code: string;
  name: string;
  lat: number;
  lon: number;
  /** 判定と同じ（大圏の方位角） */
  bearing: number;
  direction: CompassDirection;
  /** 地図に直線を引いたときの向きと、その方位 */
  mapBearing: number;
  mapDirection: CompassDirection;
  /** 地図の直線で見ると別の方位に見える */
  differs: boolean;
  distanceKm: number;
}

/** 出発地から見た街の方位（判定）と、地図の直線で見た方位 */
export function classifyCities(
  origin: GeoPoint,
  cities: { code: string; name: string; lat: number; lon: number }[],
  mapping: NodeMapping,
): GlobeCity[] {
  const out: GlobeCity[] = [];
  for (const c of cities) {
    const distanceKm = distanceKmBetween(origin.lat, origin.lon, c.lat, c.lon);
    // 出発地そのもの（とすぐ隣）は方位が定まらない
    if (distanceKm < 5) continue;
    const bearing = bearingBetween(origin.lat, origin.lon, c.lat, c.lon);
    const mapBearing = rhumbBearing(origin, c);
    const direction = directionFromBearing(bearing, mapping);
    const mapDirection = directionFromBearing(mapBearing, mapping);
    out.push({
      ...c,
      bearing,
      direction,
      mapBearing,
      mapDirection,
      differs: direction !== mapDirection,
      distanceKm,
    });
  }
  return out;
}

/**
 * 出発地を中心にした正距方位図法（平面の図用）。出発地を通る大圏は
 * すべて中心からの直線になり、長さは距離に比例する。返すのは
 * （東へ, 北へ）の km。
 */
export function azimuthalEquidistant(
  origin: GeoPoint,
  p: GeoPoint,
): [number, number] {
  const km = distanceKmBetween(origin.lat, origin.lon, p.lat, p.lon);
  if (km < 1e-9) return [0, 0];
  const b = rad(bearingBetween(origin.lat, origin.lon, p.lat, p.lon));
  return [km * Math.sin(b), km * Math.cos(b)];
}
