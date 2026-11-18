/** 地図生成スクリプトと同じ等距円筒図法。 */
const scale = 38;
const longitudeScale = Math.cos((36 * Math.PI) / 180) * scale;
export const insetBox = {
  x: 4,
  y: 4,
  width: 8.6 * longitudeScale + 8,
  height: 4.7 * scale + 8,
};
export const cardSize = { width: 172, height: 60 };

export const mapCities: Record<
  number,
  { lon: number; lat: number; x: number; y: number }
> = {
  1: { lon: 141.35, lat: 43.06, x: 452, y: 136 },
  4: { lon: 140.87, lat: 38.27, x: 452, y: 262 },
  15: { lon: 139.02, lat: 37.9, x: 186, y: 200 },
  13: { lon: 139.69, lat: 35.69, x: 452, y: 392 },
  23: { lon: 136.91, lat: 35.18, x: 280, y: 496 },
  27: { lon: 135.5, lat: 34.69, x: 6, y: 250 },
  34: { lon: 132.46, lat: 34.4, x: 6, y: 338 },
  39: { lon: 133.53, lat: 33.56, x: 96, y: 552 },
  40: { lon: 130.4, lat: 33.59, x: 6, y: 480 },
  47: { lon: 127.68, lat: 26.21, x: 172, y: 106 },
};

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
export const narrowCardSize = { width: 96, height: 54 };
export const narrowFontSize = 18;
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
