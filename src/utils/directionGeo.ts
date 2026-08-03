/**
 * 方位と座標の相互変換。
 *
 * 「地図で選んだ地点はどの方位か」と「この方位に地点を置くとどこか」は
 * 逆向きの計算だが、偏角の符号や真北・磁北の扱いを片方だけ間違えても
 * 画面上は普通に見える。ヒートマップと地図を連動させると両方向を使うため、
 * 往復が一致することをテストできる形に切り出しておく。
 */

export type CompassDirection =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export const COMPASS_DIRECTIONS: CompassDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

/** 各方位の中心方位角。45 度刻み。 */
export const DIRECTION_BEARINGS: Record<CompassDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 0〜360 に丸める。 */
export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** 2 地点間の方位角（真北基準、度）。 */
export function bearingBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/** 2 地点間の距離 km（大円距離）。 */
export function distanceKmBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 方位角を八方位に落とす。
 *
 * traditional（気学の伝統的な区切り）は四隅を 60 度、四正を 30 度に取る。
 * physical は 45 度の等分。どちらを使うかで同じ地点の方位が変わるため、
 * 判定と表示で同じ規則を使わないと、地図の扇形と行が食い違う。
 */
export function directionFromBearing(
  bearing: number,
  nodeMapping: "traditional" | "physical" = "traditional",
): CompassDirection {
  const b = normalizeBearing(bearing);
  if (nodeMapping === "physical") {
    return COMPASS_DIRECTIONS[Math.floor(((b + 22.5) % 360) / 45)];
  }
  if (b >= 345 || b < 15) return "N";
  if (b < 75) return "NE";
  if (b < 105) return "E";
  if (b < 165) return "SE";
  if (b < 195) return "S";
  if (b < 255) return "SW";
  if (b < 285) return "W";
  return "NW";
}

/** 起点から方位角・距離で座標を求める。 */
export function destinationAtBearing(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): { lat: number; lon: number } {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDeg(lat2),
    // 日付変更線をまたいでも -180〜180 に収める。
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/**
 * 表示中の方位（真北基準か磁北基準か）から、その方位の中心へ地点を置く。
 *
 * 磁北基準で表示している場合、画面上の「北」は真北から偏角ぶんずれている。
 * 偏角を足して真方位へ直してから座標を求めないと、地図に描かれている扇形と
 * 置かれる地点が 1 区画ずれる。
 */
export function destinationForDirection(
  lat: number,
  lon: number,
  direction: CompassDirection,
  distanceKm: number,
  declination: number,
  useTrueNorth: boolean,
): { lat: number; lon: number } {
  const displayBearing = DIRECTION_BEARINGS[direction];
  const trueBearing = useTrueNorth
    ? displayBearing
    : displayBearing + declination;
  return destinationAtBearing(lat, lon, trueBearing, distanceKm);
}

/**
 * 目的地が表示上どの方位に当たるか。destinationForDirection の逆。
 */
export function directionForDestination(
  lat: number,
  lon: number,
  targetLat: number,
  targetLon: number,
  declination: number,
  useTrueNorth: boolean,
  nodeMapping: "traditional" | "physical" = "traditional",
): CompassDirection {
  const trueBearing = bearingBetween(lat, lon, targetLat, targetLon);
  const displayBearing = useTrueNorth
    ? trueBearing
    : normalizeBearing(trueBearing - declination);
  return directionFromBearing(displayBearing, nodeMapping);
}
