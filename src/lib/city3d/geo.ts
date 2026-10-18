/**
 * 地点のまわり 1km 程度を平面に広げる換算と、z16 タイルの番地。
 *
 * 座標は x が東、z が南（北が -z）。threeBoardModel の bearingOfPoint と
 * 同じ向きにしてあるので、建物の重心の方位はそのまま directionFromBearing
 * に渡せる。1km 以内なら正距円筒で充分（大圏との差はテストで 0.5 度未満）。
 */
export interface Location {
  lat: number;
  lon: number;
}
export interface Point {
  x: number;
  z: number;
}
export interface Tile {
  x: number;
  y: number;
  z: number;
}
const R = 6378137;
const RAD = Math.PI / 180;
export function project(p: Location, origin: Location): Point {
  return {
    x: (p.lon - origin.lon) * RAD * R * Math.cos(origin.lat * RAD),
    z: -(p.lat - origin.lat) * RAD * R,
  };
}
export function unproject(p: Point, origin: Location): Location {
  return {
    lat: origin.lat - p.z / R / RAD,
    lon: origin.lon + p.x / (R * Math.cos(origin.lat * RAD)) / RAD,
  };
}
export function tileAt(p: Location, z = 16): Tile {
  return {
    x: Math.floor(((p.lon + 180) / 360) * 2 ** z),
    y: Math.floor(
      ((1 - Math.asinh(Math.tan(p.lat * RAD)) / Math.PI) / 2) * 2 ** z,
    ),
    z,
  };
}
export function tilePoint(
  p: { x: number; y: number },
  tile: Tile,
  extent: number,
): Location {
  return {
    lon: ((tile.x + p.x / extent) / 2 ** tile.z) * 360 - 180,
    lat:
      Math.atan(
        Math.sinh(Math.PI * (1 - (2 * (tile.y + p.y / extent)) / 2 ** tile.z)),
      ) / RAD,
  };
}
export function coveringTiles(origin: Location, radius: number): Tile[] {
  const a = tileAt(unproject({ x: -radius, z: -radius }, origin));
  const b = tileAt(unproject({ x: radius, z: radius }, origin));
  const tiles: Tile[] = [];
  for (let x = a.x; x <= b.x; x++)
    for (let y = a.y; y <= b.y; y++) tiles.push({ x, y, z: 16 });
  return tiles
    .sort((a, b) => Math.hypot(...distance(a)) - Math.hypot(...distance(b)))
    .slice(0, 9);
  function distance(t: Tile): [number, number] {
    const p = project(tilePoint({ x: 0.5, y: 0.5 }, t, 1), origin);
    return [p.x, p.z];
  }
}
