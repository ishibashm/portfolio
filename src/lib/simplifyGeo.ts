/**
 * 多角形の頂点を間引く（Douglas–Peucker）。
 *
 * ## なぜ要るか
 *
 * 用途地域は z14 より広くは出せない。**実測で決めた制限**で、千代田区の
 * 1 タイルが
 *
 *   z=11 3.6MB / z=12 1.9MB / z=13 435KB / z=14 192KB / z=15 57KB
 *
 * 画面には十数タイル並ぶので、z13 で出すと 1 画面 5MB 前後になる
 * （`utils/zoning` の `ZONING_MIN_ZOOM`）。
 *
 * ところが**広い縮尺ほど頂点は要らない。**z12 で 1 ピクセル未満しか
 * 動かない折れ点は、描いても見えない。間引けば形をほぼ保ったまま
 * 小さくできる。どこまで小さくなるかは推測せず、`scripts/probe_zoning.ts`
 * の `simplify` で実物を測る。
 *
 * ## 判定には使わない
 *
 * 用途地域は参考として重ねる層で、吉凶の判定には入らない。ここも表示だけ。
 *
 * ## 経緯度のまま計算する
 *
 * 投影して測り直すほどの精度は要らない（見えるかどうかの話）。許容量は
 * **度**で渡す。1 度 ≒ 111km なので、z12 の 1 画素は緯度でおよそ
 * 0.0004 度。`toleranceForZoom` がその換算を持つ。
 */

/** GeoJSON の座標。[経度, 緯度]。 */
export type Position = [number, number];

/**
 * そのズームで「1 画素ぶん」に当たる度数。
 *
 * 地図のタイルは 256 画素で、z のとき世界一周が 256 * 2**z 画素。
 * 経度 360 度をそれで割る。緯度方向はメルカトルで伸びるが、
 * **間引きの許容量は粗くてよい**ので経度で代表させる。
 */
export function toleranceForZoom(zoom: number, pixels = 1): number {
  return (360 / (256 * 2 ** zoom)) * pixels;
}

/** 点と線分の距離の 2 乗（度のまま）。 */
function sqSegDist(p: Position, a: Position, b: Position): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker 本体。両端は必ず残す。 */
function simplifyStep(
  points: readonly Position[],
  first: number,
  last: number,
  sqTolerance: number,
  out: Position[],
): void {
  let maxSqDist = sqTolerance;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const sqDist = sqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (index === -1) return;
  if (index - first > 1) simplifyStep(points, first, index, sqTolerance, out);
  out.push(points[index]);
  if (last - index > 1) simplifyStep(points, index, last, sqTolerance, out);
}

/**
 * 折れ線の頂点を間引く。
 *
 * **閉じた輪（多角形の外周）を渡してもよい。**先頭と末尾が同じ点なら
 * そのまま返るので、閉じたままになる。
 */
export function simplifyLine(
  points: readonly Position[],
  tolerance: number,
): Position[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  const sqTolerance = tolerance * tolerance;
  const last = points.length - 1;
  const out: Position[] = [points[0]];
  simplifyStep(points, 0, last, sqTolerance, out);
  out.push(points[last]);
  return out;
}

/**
 * 多角形の輪を間引く。
 *
 * **4 点（＝三角形＋閉じ）を下回らせない。**それ未満は面にならないので、
 * 間引きすぎたら元の輪をそのまま返す。区画が線に潰れて消えるより、
 * 大きいまま残すほうがよい。
 */
export function simplifyRing(
  ring: readonly Position[],
  tolerance: number,
): Position[] {
  const simplified = simplifyLine(ring, tolerance);
  if (simplified.length < 4) return [...ring];
  // 閉じたまま返す。間引きで末尾が落ちることは無いが、念のため確かめる。
  const head = simplified[0];
  const tail = simplified[simplified.length - 1];
  if (head[0] !== tail[0] || head[1] !== tail[1]) simplified.push([...head]);
  return simplified;
}

/** 輪が囲む面積（度の 2 乗。符号なし）。小さすぎる区画を落とすのに使う。 */
export function ringArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** 数えた結果。どれだけ減ったかを画面やログに出すために返す。 */
export interface SimplifyStats {
  /** 元の頂点の総数 */
  before: number;
  /** 間引いた後の頂点の総数 */
  after: number;
  /** 面積が足りずに落とした区画の数 */
  dropped: number;
}

type Geometry = {
  type: string;
  coordinates: unknown;
};

/**
 * GeoJSON の Polygon / MultiPolygon を間引く。
 *
 * 対応するのはこの 2 つだけ。用途地域はこの 2 つしか返さない
 * （`scripts/probe_zoning.ts` の実測）。知らない型はそのまま返す——
 * **黙って落とすと「区画が無い場所」と見分けが付かない。**
 */
export function simplifyGeometry(
  geometry: Geometry,
  tolerance: number,
  stats?: SimplifyStats,
): Geometry {
  const doRings = (rings: Position[][]): Position[][] =>
    rings.map((ring) => {
      if (stats) stats.before += ring.length;
      const next = simplifyRing(ring, tolerance);
      if (stats) stats.after += next.length;
      return next;
    });

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: doRings(geometry.coordinates as Position[][]),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: (geometry.coordinates as Position[][][]).map(doRings),
    };
  }
  return geometry;
}

/**
 * 外周が `minArea`（度の 2 乗）に満たない区画かどうか。
 *
 * 広い縮尺では、細い区画は 1 画素にも満たない。数だけ増えて絵は変わら
 * ないので落とす。**落とした数は必ず数える**（黙って減らさない）。
 */
export function isTinyGeometry(geometry: Geometry, minArea: number): boolean {
  if (minArea <= 0) return false;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as Position[][];
    return rings.length === 0 || ringArea(rings[0]) < minArea;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as Position[][][];
    // どれか 1 つでも残る大きさなら残す
    return !polys.some((rings) => rings[0] && ringArea(rings[0]) >= minArea);
  }
  return false;
}
