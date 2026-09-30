/**
 * 三盤の方位盤の、盤面の絵（canvas）と盤の上の座標の対応。**純粋な関数だけ。**
 *
 * 立体の盤は、円盤の上面に canvas で描いた絵を貼る（扇形・九星・呼び名）。
 * 絵の上の角度と、盤の上で押した点の方位（threeBoardModel.directionOfPoint）
 * が同じ向きを指していないと、塗った扇形と押して出る方位が食い違う。
 * その対応をここに 1 か所で持ち、テストで three.js の実物（CircleGeometry の
 * UV と、上面を寝かせる回転）と突き合わせる。
 *
 * 約束:
 * - 絵の上が北、右が東（地図と同じ）。盤の上では北が -z、東が +x
 * - 方位角は真北から時計回り。canvas の角度は +x から時計回り（y が下向き
 *   なので）。方位角 b は canvas の角度 b − 90 度になる
 */

/** 方位角（度）→ canvas.arc に渡す角度（ラジアン） */
export function canvasAngleOfBearing(bearingDeg: number): number {
  return ((bearingDeg - 90) * Math.PI) / 180;
}

/** 方位角と半径（0〜1、盤の半径に対する割合）→ canvas の座標 */
export function canvasPointOfBearing(
  bearingDeg: number,
  radius: number,
  size: number,
): [number, number] {
  const a = canvasAngleOfBearing(bearingDeg);
  const half = size / 2;
  return [
    half + Math.cos(a) * radius * half,
    half + Math.sin(a) * radius * half,
  ];
}

/**
 * canvas の座標 → 盤の上の座標（x, z。盤の半径を 1 とする）。
 *
 * three.js の CircleGeometry の UV は u = x/2r + 0.5・v = y/2r + 0.5 で、
 * テクスチャは既定で上下を返す（flipY）ので canvas の上が v = 1。上面は
 * x 軸まわりに −90 度寝かせるので、円の +y が盤の −z（北）になる。
 */
export function boardPointOfCanvas(
  cx: number,
  cy: number,
  size: number,
): [number, number] {
  return [(2 * cx) / size - 1, (2 * cy) / size - 1];
}

/**
 * 盤の向き。"north" は北を上（立体では奥）、"south" は南を上。
 *
 * 気学の本の方位盤は南を上に描くものが多い。これは地図を 180 度**回した**
 * もので、裏返しではない（南が上なら東は左、西は右、北は下）。方位の
 * 割り当ては変わらず、見る向きだけが変わる。
 */
export type BoardOrientation = "north" | "south";

/**
 * 方位角 b の点が、画面の上から時計回りに何度の所に見えるか。北を上なら
 * そのまま、南を上なら 180 度足す（正規化はしない。三角関数に渡すだけ）。
 */
export function screenBearing(
  bearingDeg: number,
  orientation: BoardOrientation,
): number {
  return orientation === "south" ? bearingDeg + 180 : bearingDeg;
}
