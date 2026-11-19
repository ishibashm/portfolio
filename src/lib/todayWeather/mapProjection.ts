/** 地図生成スクリプトと同じ等距円筒図法。 */
const scale = 38;
const longitudeScale = Math.cos((36 * Math.PI) / 180) * scale;
export const insetBox = {
  x: 4,
  y: 4,
  width: 8.6 * longitudeScale + 8,
  height: 4.7 * scale + 8,
};

export type MapTransform = { x: number; y: number; scale: number };

/** 都市の経緯度。地図上の点はこの値を project して使う。 */
export const mapCities: Record<number, { lon: number; lat: number }> = {
  1: { lon: 141.35, lat: 43.06 },
  4: { lon: 140.87, lat: 38.27 },
  15: { lon: 139.02, lat: 37.9 },
  13: { lon: 139.69, lat: 35.69 },
  23: { lon: 136.91, lat: 35.18 },
  27: { lon: 135.5, lat: 34.69 },
  34: { lon: 132.46, lat: 34.4 },
  39: { lon: 133.53, lat: 33.56 },
  40: { lon: 130.4, lat: 33.59 },
  47: { lon: 127.68, lat: 26.21 },
};

/** 札の縁で、点に一番近いところ。引き出し線の終点にする。 */
export function nearestOnCard(
  point: { x: number; y: number },
  card: { x: number; y: number },
  size: { width: number; height: number },
) {
  return {
    x: Math.min(Math.max(point.x, card.x), card.x + size.width),
    y: Math.min(Math.max(point.y, card.y), card.y + size.height),
  };
}

export function project(lon: number, lat: number) {
  const inset = lat < 28.7 && lon < 131.5;
  const frame = inset
    ? { lon: 122.8, lat: 28.7, offset: 8 }
    : { lon: 128.4, lat: 45.9, offset: 0 };
  return {
    x: (lon - frame.lon) * longitudeScale + frame.offset,
    y: (frame.lat - lat) * scale + frame.offset,
  };
}

export function applyTransform(
  point: { x: number; y: number },
  transform: MapTransform,
) {
  return {
    x: transform.x + point.x * transform.scale,
    y: transform.y + point.y * transform.scale,
  };
}

// 狭い画面では地図の両側に札を並べ、都市の点を隠さない。
export const narrowCardSize = { width: 96, height: 62 };
export const narrowFontSize = 18;
export const narrowViewBox = { width: 400, height: 364 };
export const narrowMap: MapTransform = { x: 101, y: 74, scale: 0.31 };
export const narrowCities: Record<number, { x: number; y: number }> = {
  1: { x: 304, y: 8 },
  4: { x: 304, y: 80 },
  15: { x: 0, y: 80 },
  13: { x: 304, y: 152 },
  23: { x: 304, y: 224 },
  27: { x: 0, y: 152 },
  34: { x: 0, y: 224 },
  39: { x: 304, y: 296 },
  40: { x: 0, y: 296 },
  47: { x: 0, y: 8 },
};

/**
 * タブレット以上（iPad mini 縦 744px を含む）。狭い地図を拡大すると札が
 * 大きく本州が小さく見えるので、札は左右に置き、地図は中央で大きくする。
 *
 * sm（640px）から使う。md（768px）だと iPad mini 縦が狭い地図のままになる。
 */
export const wideCardSize = { width: 148, height: 64 };
export const wideFontSize = 18;
export const wideTempFontSize = 16;
export const wideViewBox = { width: 680, height: 460 };
export const wideMap: MapTransform = { x: 160, y: 48, scale: 0.55 };
export const wideCities: Record<number, { x: number; y: number }> = {
  1: { x: 532, y: 16 },
  4: { x: 532, y: 96 },
  15: { x: 0, y: 96 },
  13: { x: 532, y: 176 },
  23: { x: 532, y: 256 },
  27: { x: 0, y: 176 },
  34: { x: 0, y: 256 },
  39: { x: 532, y: 336 },
  40: { x: 0, y: 336 },
  47: { x: 0, y: 16 },
};
