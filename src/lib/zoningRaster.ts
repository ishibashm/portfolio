import { deflateSync } from "node:zlib";
import {
  MUTED_ZONING_FILL,
  UNKNOWN_ZONING_FILL,
  ZONING_FILL,
  zoningNameOf,
  type ZoningName,
} from "@/utils/zoning";
import type { RawZoningFeature } from "@/lib/zoningUpstream";

/**
 * 用途地域を 1 タイルぶん PNG に焼く。
 *
 * ## なぜ画像にするか
 *
 * GeoJSON を配る層（`/api/zoning`）の下限は z13 で、根拠は受け取る側の
 * 大きさの実測——間引いても z12 で 1 画面 6.5MB（`utils/zoning` の表）。
 * 広い縮尺ほど区画は増えて頂点は要らなくなるので、**多角形ではなく
 * 塗った絵を配る**ほうが筋がよい。256×256 の PNG は 13 色の塗り分け
 * なら数 KB〜20KB で、ブラウザ側の描画コストも無い（Leaflet の
 * TileLayer がそのまま貼る）。
 *
 * ## ここはネットワークに触らない
 *
 * 受け取った GeoJSON の区画を、指定タイルの画素へ落とすだけ。取得は
 * `lib/zoningUpstream`、組み立ては `/api/zoning/raster` が持つ。
 * 純粋関数なので、そのまま検査できる。
 *
 * ## 塗り方
 *
 * - 走査線（scanline）の偶奇規則。穴（内側の輪）は同じ多角形の輪を
 *   まとめて偶奇で数えるので自然に抜ける
 * - 画素の中心（y + 0.5）で交差を取り、交点の対のあいだを塗る
 * - 縁の滑らかさ（アンチエイリアス）は付けない。広域の参考の層で、
 *   TileLayer が 0.45 で透かすので目立たない
 * - 色は `utils/zoning` の ZONING_FILL そのまま。GeoJSON の層と同じ
 *   区分が同じ色に見えるようにする
 * - 区画は配列の順に上書きする（SVG の重なり順と同じ）
 */

/** タイルの 1 辺（画素）。Leaflet の既定と同じ。 */
export const ZONING_TILE_SIZE = 256;

/** 経度 → z のタイル座標（小数）。整数部が何枚目か。 */
export function mercatorX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

/** 緯度 → z のタイル座標（小数）。 */
export function mercatorY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** "#RRGGBB" → [r, g, b]。 */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 画素座標の輪。[x, y] の並び。 */
type PixelRing = [number, number][];

/**
 * 経緯度の輪を、タイル (z, x, y) の画素座標へ落とす。
 * タイルの外に出る点はそのまま外の座標になる（塗るときに切る）。
 */
export function projectRing(
  ring: readonly (readonly number[])[],
  z: number,
  x: number,
  y: number,
): PixelRing {
  const out: PixelRing = [];
  for (const p of ring) {
    if (p.length < 2) continue;
    const lon = p[0];
    const lat = p[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push([
      (mercatorX(lon, z) - x) * ZONING_TILE_SIZE,
      (mercatorY(lat, z) - y) * ZONING_TILE_SIZE,
    ]);
  }
  return out;
}

/**
 * 1 つの多角形（外周＋穴）を偶奇規則で塗る。
 * `rgba` は size×size×4 の並び。色は不透明で置く（透かすのは表示側）。
 */
export function fillPolygon(
  rgba: Uint8ClampedArray,
  size: number,
  rings: readonly PixelRing[],
  color: readonly [number, number, number],
): void {
  /* 輪の縦の範囲で走査する行を絞る */
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [, py] of ring) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;
  const rowStart = Math.max(0, Math.floor(minY));
  const rowEnd = Math.min(size - 1, Math.ceil(maxY));

  const xs: number[] = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    const sy = row + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      const n = ring.length;
      if (n < 3) continue;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        /* 上下どちらかの端を含めて片方だけ数える（頂点の二重数えを防ぐ） */
        if (yi > sy === yj > sy) continue;
        xs.push(xi + ((sy - yi) * (xj - xi)) / (yj - yi));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]));
      const to = Math.min(size, Math.round(xs[k + 1]));
      for (let px = from; px < to; px++) {
        const o = (row * size + px) * 4;
        rgba[o] = color[0];
        rgba[o + 1] = color[1];
        rgba[o + 2] = color[2];
        rgba[o + 3] = 255;
      }
    }
  }
}

export interface RasterizeOptions {
  /** 1 区分だけを残す。他は灰色に落とす（GeoJSON の層と同じ見え方）。 */
  only?: ZoningName | null;
}

/**
 * 区画の集まりをタイル (z, x, y) の RGBA に落とす。
 *
 * 区画は**どのズームの上流タイルから来たものでもよい**（座標は経緯度
 * なので）。広い縮尺を z12 の子タイルから組むのはこの性質による。
 */
export function rasterizeZoning(
  features: readonly RawZoningFeature[],
  z: number,
  x: number,
  y: number,
  options: RasterizeOptions = {},
): Uint8ClampedArray {
  const size = ZONING_TILE_SIZE;
  const rgba = new Uint8ClampedArray(size * size * 4);
  paintZoningInto(rgba, features, z, x, y, options);
  return rgba;
}

/**
 * 既にある RGBA に区画を塗り足す。
 *
 * `rasterizeZoning` はタイル 1 枚を 1 回で作る（API 向け）。全国の俯瞰を
 * 焼くとき（`scripts/bake_zoning_overview.ts`）は 1,900 の市区町村
 * ファイルを順に読むので、同じタイルに何度も塗り足す必要がある。
 * 塗り方は 1 か所（ここ）だけにして、API と焼き込みで色や境界が
 * 食い違わないようにする。
 */
export function paintZoningInto(
  rgba: Uint8ClampedArray,
  features: readonly RawZoningFeature[],
  z: number,
  x: number,
  y: number,
  options: RasterizeOptions = {},
): void {
  const size = ZONING_TILE_SIZE;
  const only = options.only ?? null;

  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const name = zoningNameOf(
      f.properties?.use_area_ja,
      f.properties?.youto_id,
    );
    const hex =
      only && name !== only
        ? MUTED_ZONING_FILL
        : name
          ? ZONING_FILL[name]
          : UNKNOWN_ZONING_FILL;
    const color = hexToRgb(hex);

    if (g.type === "Polygon") {
      const rings = (g.coordinates as number[][][]).map((r) =>
        projectRing(r, z, x, y),
      );
      fillPolygon(rgba, size, rings, color);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as number[][][][]) {
        const rings = poly.map((r) => projectRing(r, z, x, y));
        fillPolygon(rgba, size, rings, color);
      }
    }
    /* 知らない型は描かない。GeoJSON の層と同じく、上流は Polygon と
       MultiPolygon しか返さない（実測） */
  }
}

/* ------------------------------------------------------------------ *
 * PNG の書き出し。依存を足さないために自前で持つ。
 *
 * 8 ビット RGBA、行フィルタは 0（無し）、IDAT は zlib（Node の
 * deflateSync）。sharp は node_modules に居るが Next の任意依存で、
 * standalone の書き出しに native の実体まで付いてくる保証が無い。
 * 256×256 を焼くだけなら 40 行で済む。
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA（8 ビット）を PNG に。 */
export function encodePng(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error("encodePng: 画素数と幅・高さが合わない");
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  /* 各行の先頭にフィルタ種別 0 を置く */
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0;
    raw.set(
      rgba.subarray(row * stride, (row + 1) * stride),
      row * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * 要求されたタイル (z, x, y) を覆う、`sourceZoom` の子タイルの一覧。
 * z が sourceZoom 以上ならそのタイル 1 枚だけ（そのまま上流に投げる）。
 */
export function sourceTilesFor(
  z: number,
  x: number,
  y: number,
  sourceZoom: number,
): [number, number, number][] {
  if (z >= sourceZoom) return [[z, x, y]];
  const dz = sourceZoom - z;
  const n = 2 ** dz;
  const out: [number, number, number][] = [];
  for (let dx = 0; dx < n; dx++) {
    for (let dy = 0; dy < n; dy++) {
      out.push([sourceZoom, x * n + dx, y * n + dy]);
    }
  }
  return out;
}
