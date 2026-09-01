/**
 * 緯度経度と XYZ タイルの相互変換。
 *
 * 用途地域の重ね描き（`ZoningLayer`）と、物件のポップアップに出す
 * 航空写真の切り出しが**同じ計算を必要とする**ので、1 か所に置く。
 * 以前は `ZoningLayer.tsx` の中に private な関数として書かれていた。
 *
 * 使うのは Web メルカトル（EPSG:3857）。地理院タイルも OSM も CARTO も
 * すべてこの並びなので、URL の {z}/{x}/{y} にそのまま入れられる。
 *
 * ## 端の扱い
 *
 * メルカトルは極を表せない。緯度は ±85.05112878 度で切る（`2**z` 枚に
 * 収まる範囲）。**切らないと `Math.tan` が発散して x/y が NaN になり、
 * タイル URL が "NaN" を含む文字列になって静かに 404 する。**
 * 経度も同じ理由で ±180 に丸める。
 */

/** メルカトルで表せる緯度の限界。これを超えると発散する。 */
export const MERCATOR_MAX_LAT = 85.05112878;

function clampLat(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return Math.min(MERCATOR_MAX_LAT, Math.max(-MERCATOR_MAX_LAT, lat));
}

function clampLon(lon: number): number {
  if (!Number.isFinite(lon)) return 0;
  return Math.min(180, Math.max(-180, lon));
}

/**
 * タイルの座標。整数部が何枚目か、`fx` / `fy` がそのタイルの中の
 * どこか（0〜1）。写真の上に「ここ」の印を置くときに使う。
 */
export interface TilePoint {
  x: number;
  y: number;
  /** タイル内の左からの割合（0〜1） */
  fx: number;
  /** タイル内の上からの割合（0〜1） */
  fy: number;
}

/**
 * 枚数の範囲に収める。
 *
 * 緯度を限界まで切っても、**浮動小数の誤差で端が 1 枚ぶんはみ出す**
 * （実測: 85.05112878 度で floor が -1 になる）。番号として使うので、
 * 最後に 0〜n-1 へ丸める。
 */
function clampIndex(value: number, z: number): number {
  const n = 2 ** z;
  if (!Number.isFinite(value)) return 0;
  return Math.min(n - 1, Math.max(0, value));
}

/** 経度 → タイルの列番号（整数）。 */
export function lonToTileX(lon: number, z: number): number {
  return clampIndex(Math.floor(((clampLon(lon) + 180) / 360) * 2 ** z), z);
}

/** 緯度 → タイルの行番号（整数）。 */
export function latToTileY(lat: number, z: number): number {
  const r = (clampLat(lat) * Math.PI) / 180;
  return clampIndex(
    Math.floor(
      ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
    ),
    z,
  );
}

/** 緯度経度 → タイル座標＋タイル内の位置。 */
export function tilePointOf(lat: number, lon: number, z: number): TilePoint {
  const n = 2 ** z;
  const rawX = ((clampLon(lon) + 180) / 360) * n;
  const r = (clampLat(lat) * Math.PI) / 180;
  const rawY =
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x = clampIndex(Math.floor(rawX), z);
  const y = clampIndex(Math.floor(rawY), z);
  // 位置は丸めたタイルの中で測り直す。丸めた側とずれると印が枠外に出る。
  return {
    x,
    y,
    fx: Math.min(1 - Number.EPSILON, Math.max(0, rawX - x)),
    fy: Math.min(1 - Number.EPSILON, Math.max(0, rawY - y)),
  };
}

/**
 * 地理院の**空中写真**（シームレス空中写真）1 枚の URL。
 *
 * 配信は z2〜18。範囲の外を渡すと 404 になり、`<img>` は壊れた絵に
 * なるので、ここで丸める。拡張子は jpg（他の地理院タイルは png だが
 * 写真だけ jpg）。
 */
export const AERIAL_MIN_ZOOM = 2;
export const AERIAL_MAX_ZOOM = 18;

export function aerialPhotoUrl(lat: number, lon: number, z: number): string {
  const zoom = Math.min(
    AERIAL_MAX_ZOOM,
    Math.max(AERIAL_MIN_ZOOM, Math.floor(z)),
  );
  const { x, y } = tilePointOf(lat, lon, zoom);
  return `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${zoom}/${x}/${y}.jpg`;
}

/**
 * 画面に入るタイルを、**中心に近い順**に並べて返す。
 *
 * 上限を掛けて間引くとき、並べた順のまま切ると**端だけが残る。**
 * 用途地域の重ね描きが実際にそうなっていた（列ごとに詰めてから
 * 先頭 12 枚で切っていたので、いちばん西の列だけが塗られ、見ている
 * 市街地が真っ白のままだった。2026-09-01 に利用者が発見）。
 *
 * 上限があること自体は妥当（1 枚ずつ API を叩くので、広い画面で
 * 全部取ると遅い）。**間引くなら、見ている場所から遠いものを捨てる。**
 *
 * 距離はタイルの中心どうしのユークリッド距離。同距離のときは x → y の
 * 順で決める（並びが実行ごとに変わらないように）。
 */
export function tilesByDistanceFromCenter(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  centerX: number,
  centerY: number,
): [number, number][] {
  const tiles: [number, number][] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  }
  /* タイルの中心で測る。左上の角で測ると、中心のタイルが 1 枚ぶん
     ずれて隣に負ける */
  const d2 = ([x, y]: [number, number]) =>
    (x + 0.5 - centerX) ** 2 + (y + 0.5 - centerY) ** 2;
  return tiles.sort((a, b) => {
    const diff = d2(a) - d2(b);
    if (diff !== 0) return diff;
    return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
  });
}
