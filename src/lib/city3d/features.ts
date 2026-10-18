/**
 * 国土地理院ベクトルタイルの地物を、地点中心の平面座標に直す。
 *
 * タイルには建物の高さが無い。種別（vt_code）ごとの目安を 1 か所に置き、
 * 画面にも「目安」と書く。高さを推し量る揺らぎは足さない（実在しない
 * 凹凸を描くと、測ったように見えてしまう）。
 */
import {
  project,
  tilePoint,
  type Location,
  type Point,
  type Tile,
} from "./geo";
// ベクトルタイルには高さが無いので、建物の種別ごとの目安を使う。
export const BUILDING_HEIGHT: Record<number, number> = {
  3101: 7,
  3102: 15,
  3103: 45,
  3111: 4,
  3112: 4,
};
export interface Footprint {
  rings: Point[][];
  height: number;
  centroid: Point;
}
export interface CityData {
  buildings: Footprint[];
  roads: Point[][];
  rails: Point[][];
  water: Point[][];
  failedTiles: number;
}
export function convertRings(
  rings: { x: number; y: number }[][],
  tile: Tile,
  extent: number,
  origin: Location,
): Point[][] {
  return rings.map((r) =>
    r.map((p) => project(tilePoint(p, tile, extent), origin)),
  );
}
export function footprint(rings: Point[][], code: number): Footprint | null {
  if (!BUILDING_HEIGHT[code] || !rings[0] || rings[0].length < 4) return null;
  const ring = rings[0];
  let area = 0,
    x = 0,
    z = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1],
      c = a.x * b.z - b.x * a.z;
    area += c;
    x += (a.x + b.x) * c;
    z += (a.z + b.z) * c;
  }
  if (Math.abs(area) < 0.01) return null;
  return {
    rings,
    height: BUILDING_HEIGHT[code],
    centroid: { x: x / (3 * area), z: z / (3 * area) },
  };
}
