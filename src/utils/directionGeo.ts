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

/**
 * 方位の日本語ラベル。
 *
 * 置き場所がここなのは、**このファイルが暦計算を引かない葉だから。**
 * 元は `lib/kigakuContent` にあったが、あちらは `ephemerisEngine`
 * （→ lunar-javascript、約 300KB）を値として引くので、ラベルを 1 つ
 * 使いたいだけの client 部品までバンドルに暦が乗っていた（`/houi` で
 * 実測）。`kigakuContent` からは再輸出しているので、既存の import は
 * そのまま動く。
 */
export const DIRECTION_LABELS: Record<CompassDirection, string> = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 0〜360 に丸める。 */
export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/**
 * 2 地点間の方位角（真北基準、度）。
 *
 * **座標が数でないときは 0（北）を返す。**サイトの規則
 * 「NaN は北に倒す」（kigakuUtils の getKigakuSector、#740 で
 * directionFromBearing も揃えた）に合わせる。
 *
 * 揃えた理由は、同じ計算が 6 か所に写されていて**守りが 1 か所に
 * しか無かった**こと。シミュレータの写しだけが NaN を 0 に倒し、
 * 残り 5 か所（api/rentals/arbitrage・municipalities-wealth・
 * relocation/history・arbitrage/timeline・TenChiJinEvaluation）は
 * NaN をそのまま返していた。**方位そのものはどちらも「北」に
 * なるが、方位角を数字で出す画面では「NaN 度」になる。**
 */
export function bearingBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
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
  // 有限でない入力（NaN・±Infinity）は「方位を出せない」。kigakuUtils の
  // getKigakuSector が持つガードと同じ規則で北に倒す。以前は traditional で
  // "NW"（比較がすべて偽になり最後の枝に落ちる）、physical で undefined
  // （添字が NaN になる。CompassDirection を名乗る型の嘘）と、同じ壊れた
  // 入力でも入口とモードで答えが割れていた。
  if (!Number.isFinite(bearing)) return "N";

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
 * 扇形が画面の端に届かないと、方位は「近くだけの話」に見える。
 *
 * 地図の扇形は 30km 固定で描いていた。ズーム 11 の画面幅がおよそ 40km
 * なので近景ではちょうど収まるが、引くと扇形の先が画面の途中で切れる。
 * 「半径 50km くらいまでしか吉凶が出ない」という見え方はこれが理由で、
 * 実際には方位の判定も物件の検索も距離の上限を持っていない。
 *
 * 長さは表示中の矩形から引く。出発地から見えている四隅までの最大距離を
 * 取れば、どのズームでも扇形が画面の端まで届く。
 */
export const MAX_WEDGE_RANGE_KM = 3000;

/** 表示範囲がまだ確定していないときの長さ。地図の初期ズームに合わせた近景ぶん。 */
export const FALLBACK_WEDGE_RANGE_KM = 30;

/**
 * 扇形の半幅（度）。directionFromBearing の区切りと同じ値を返す。
 *
 * 幅を地図側に直接書いていたため、区切りの定義が 2 か所にあった。扇形の
 * 縁と八方位の境目は同じものなので、ずれると「扇形の中にあるのに別の方位
 * と判定される」帯ができる。ここから引くことで一致を保つ。
 *
 * traditional は四隅 60 度・四正 30 度（半幅 30 / 15）、physical は 45 度の
 * 等分（半幅 22.5）。directionFromBearing の分岐と対応している。
 */
export function directionWedgeHalfWidth(
  direction: CompassDirection,
  nodeMapping: "traditional" | "physical" = "traditional",
): number {
  if (nodeMapping === "physical") return 22.5;
  return direction.length === 2 ? 30 : 15;
}

/**
 * 方位の境目（始まりと終わりの方位角）。**表に書き写さない。**
 *
 * 中心方位角（DIRECTION_BEARINGS）と半幅（directionWedgeHalfWidth）から
 * 出す。以前はシミュレータが
 *
 *     N: [345, 15], NE: [15, 75], E: [75, 105], ...
 *
 * という表を自前で持っていて、推奨ゾーンの多角形をそこから描いていた。
 * 区切りの定義が 2 か所にある状態で、**片方だけ動かせば「ゾーンの中に
 * あるのに別の方位と判定される」帯ができる。**扇形で実際に起きた
 * （#776。描画と判定の基準がずれ、境目から 24km がずれていた）。
 *
 * 返すのは [始まり, 終わり]。北のように 345 → 15 と 0 度をまたぐ場合が
 * あるので、**始まりのほうが大きいことがある。**使う側はそれを見込むこと
 * （区間に入るかを見るなら directionFromBearing を使うほうが安全）。
 */
export function directionAngleRange(
  direction: CompassDirection,
  nodeMapping: "traditional" | "physical" = "traditional",
): [number, number] {
  const half = directionWedgeHalfWidth(direction, nodeMapping);
  const center = DIRECTION_BEARINGS[direction];
  return [normalizeBearing(center - half), normalizeBearing(center + half)];
}

export interface WedgeViewBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * 表示中の矩形を覆うのに必要な扇形の長さ km。
 *
 * 出発地が画面の外にあっても、四隅までの最大距離を取るので扇形は
 * 画面を覆う。上限は日本の南北の広がりに合わせた MAX_WEDGE_RANGE_KM。
 * 地図を世界規模まで引いたときに、扇形が地球を一周しないようにする。
 */
export function wedgeRangeKmForBounds(
  baseLat: number,
  baseLon: number,
  bounds: WedgeViewBounds | null | undefined,
): number {
  if (!bounds) return FALLBACK_WEDGE_RANGE_KM;
  const corners: [number, number][] = [
    [bounds.minLat, bounds.minLon],
    [bounds.minLat, bounds.maxLon],
    [bounds.maxLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  ];
  const farthest = corners.reduce(
    (max, [lat, lon]) =>
      Math.max(max, distanceKmBetween(baseLat, baseLon, lat, lon)),
    0,
  );
  if (!Number.isFinite(farthest) || farthest <= 0) {
    return FALLBACK_WEDGE_RANGE_KM;
  }
  return Math.min(farthest, MAX_WEDGE_RANGE_KM);
}

/**
 * 方位の扇形を描くための頂点列（[lat, lon] の配列）。
 *
 * 縁も大円で刻む。扇形の縁は「出発地から見た方位角がちょうど境界値に
 * なる点の集まり」で、これは大円であってメルカトル上の直線ではない。
 * 30km なら差は見えないが、全国を覆う長さでは数十 km ずれる。県の
 * 塗り分け（bearingBetween → directionFromBearing）と扇形が別の県を
 * 指してしまうため、半径方向も分割して打つ。
 */
export function directionWedgePoints(
  lat: number,
  lon: number,
  centerBearing: number,
  halfWidthDeg: number,
  rangeKm: number,
): [number, number][] {
  const RADIAL_STEPS = 12;
  const ARC_STEP_DEG = 5;

  const points: [number, number][] = [[lat, lon]];
  const push = (bearing: number, km: number) => {
    const p = destinationAtBearing(lat, lon, bearing, km);
    points.push([p.lat, p.lon]);
  };

  // 反時計回りの縁を外側へ
  for (let i = 1; i <= RADIAL_STEPS; i++) {
    push(centerBearing - halfWidthDeg, (rangeKm * i) / RADIAL_STEPS);
  }
  // 外周
  for (
    let offset = -halfWidthDeg + ARC_STEP_DEG;
    offset < halfWidthDeg;
    offset += ARC_STEP_DEG
  ) {
    push(centerBearing + offset, rangeKm);
  }
  // 時計回りの縁を内側へ
  for (let i = RADIAL_STEPS; i >= 1; i--) {
    push(centerBearing + halfWidthDeg, (rangeKm * i) / RADIAL_STEPS);
  }

  return points;
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
