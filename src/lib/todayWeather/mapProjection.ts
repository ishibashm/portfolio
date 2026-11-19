/** 地図生成スクリプトと同じ等距円筒図法。 */
const scale = 38;
const longitudeScale = Math.cos((36 * Math.PI) / 180) * scale;
export const insetBox = {
  x: 4,
  y: 4,
  width: 8.6 * longitudeScale + 8,
  height: 4.7 * scale + 8,
};
// 3 行の札（都市と天気・気温・東京から見た方位）。本州に重ならないよう、
// 札は海の上に置き、引き出し線で都市の点とつなぐ。
export const cardSize = { width: 148, height: 64 };
export const mapViewBox = { width: 640, height: 652 };

export const mapCities: Record<
  number,
  { lon: number; lat: number; x: number; y: number }
> = {
  1: { lon: 141.35, lat: 43.06, x: 470, y: 150 },
  4: { lon: 140.87, lat: 38.27, x: 470, y: 262 },
  15: { lon: 139.02, lat: 37.9, x: 180, y: 200 },
  13: { lon: 139.69, lat: 35.69, x: 470, y: 360 },
  23: { lon: 136.91, lat: 35.18, x: 470, y: 440 },
  27: { lon: 135.5, lat: 34.69, x: 300, y: 480 },
  34: { lon: 132.46, lat: 34.4, x: 4, y: 320 },
  39: { lon: 133.53, lat: 33.56, x: 150, y: 520 },
  40: { lon: 130.4, lat: 33.59, x: 4, y: 584 },
  47: { lon: 127.68, lat: 26.21, x: 120, y: 120 },
};

/** 札の縁で、点に一番近いところ。引き出し線の終点にする。 */
export function nearestOnCard(
  point: { x: number; y: number },
  card: { x: number; y: number },
  size: { width: number; height: number } = cardSize,
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

// 狭い画面では地図の両側に札を並べ、都市の点を隠さない。
export const narrowCardSize = { width: 96, height: 62 };
export const narrowFontSize = 18;
export const narrowViewBox = { width: 400, height: 364 };
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
