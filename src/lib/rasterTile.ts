import { tileUnitsOf } from "@/lib/tileCoords";

/**
 * 多角形を 1 枚のタイル（256 画素四方）に塗る。**表示だけ。**
 *
 * ## なぜ要るか
 *
 * 用途地域を俯瞰（z11〜12）でも出したい。だが多角形のまま送ると、
 * いちばん重い千代田区で z12 の 1 タイルが間引いても 433KB、1 画面で
 * 6.5MB になる（`utils/zoning` の実測表）。そのうえブラウザ側で
 * 数千の SVG パスを描くので、受け取れても地図が重くなる。
 *
 * 俯瞰で見たいのは「この辺は商業、この辺は住宅」の色の広がりだけで、
 * 区画の輪郭の座標は要らない。だからサーバで**塗った絵**にして返す。
 * 256 画素四方の塗り絵は同じ色が続くので PNG で数 KB〜十数 KB に収まり、
 * ブラウザはただの画像タイルとして描く（CPU を使わない）。
 *
 * ## 判定には使わない
 *
 * 用途地域は参考として重ねる層で、吉凶の判定には入らない。ここも表示だけ。
 *
 * ## 塗り方
 *
 * 走査線で埋める（偶奇則）。1 つの多角形の外周と穴を同じ偶奇に掛ける
 * ので、穴は自然に抜ける。縁は 2 倍で描いて 4 画素を 1 画素に平均する
 * （`supersample`）。それ以上細かくしても 45% の透過で重ねる絵では
 * 見分けられない。
 *
 * 経緯度からタイル内の画素への変換は `lib/tileCoords` の
 * `tileUnitsOf`。**ここに写し直さない。**
 */

/** GeoJSON の座標。[経度, 緯度]。 */
type Position = [number, number];

/** 塗る 1 件。geometry は GeoJSON の Polygon / MultiPolygon。 */
export interface FillFeature {
  geometry: { type: string; coordinates: unknown } | null | undefined;
  /** `#RRGGBB`。読めない色は塗らずに飛ばす（数える）。 */
  fill: string;
}

/** 塗った結果。何を飛ばしたかを返す（黙って減らさない）。 */
export interface RasterStats {
  /** 塗った区画の数（タイルに 1 画素も掛からなかったものは含めない） */
  painted: number;
  /** 知らない geometry の型で飛ばした数 */
  skippedGeometry: number;
  /** 色が読めずに飛ばした数 */
  skippedColor: number;
}

export const TILE_SIZE = 256;

export function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** 経緯度の輪 → そのタイルの左上を原点とする画素座標（`scale` 画素四方）。 */
function projectRing(
  ring: readonly Position[],
  z: number,
  tileX: number,
  tileY: number,
  scale: number,
): Position[] {
  const out: Position[] = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const u = tileUnitsOf(lat, lon, z);
    out[i] = [(u.x - tileX) * scale, (u.y - tileY) * scale];
  }
  return out;
}

/**
 * 1 つの多角形（外周＋穴）を偶奇則で塗る。
 *
 * 画素の中心（+0.5）で辺との交点を取り、交点を左から並べて 2 つずつの
 * 間を埋める。辺の端点はどちらか片側だけを含める（半開区間）。両方
 * 含めると頂点の行で交点が二重に数えられ、そこだけ塗りが反転する。
 *
 * 辺は上端の行で並べておき、走査線が降りるにつれて「掛かっている辺」
 * だけを見る（辺表）。画素は 32 ビット 1 語として `fill` で埋める。
 * 区画 4,000・頂点 24 万の模擬タイル（実物の z11 千代田区より重いはず。
 * 実物は開発環境から取れず未計測）で、毎行に全部の辺を見る素朴な実装の
 * 480ms が 220ms 前後になった（2026-09-03、手元の計測。うち経緯度 →
 * 画素の投影が 55ms、2 倍描きの平均が 40ms）。区画 150 の典型的な
 * タイルは 35ms。1 タイルにつき 1 度きりで、塗った絵は覚える
 * （`/api/zoning/raster`）。
 */
function fillPolygon(
  rings: readonly Position[][],
  size: number,
  packed: number,
  pixels: Uint32Array,
): boolean {
  let count = 0;
  for (const ring of rings) count += ring.length;
  if (count === 0) return false;

  /* 辺を平らな配列に。y0 < y1 に揃える（偶奇則は向きを問わない） */
  const ex = new Float64Array(count);
  const ey0 = new Float64Array(count);
  const ey1 = new Float64Array(count);
  const slope = new Float64Array(count);
  let n = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      let [x0, y0] = ring[j];
      let [x1, y1] = ring[i];
      if (y0 === y1) continue; // 水平な辺は走査線と交わらない
      if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
      if (!Number.isFinite(x1) || !Number.isFinite(y1)) continue;
      if (y0 > y1) {
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
      }
      ex[n] = x0;
      ey0[n] = y0;
      ey1[n] = y1;
      slope[n] = (x1 - x0) / (y1 - y0);
      n += 1;
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }
  }
  if (n === 0) return false;

  /* 上端の行の順。走査線が降りるにつれて先頭から取り込む */
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => ey0[a] - ey0[b]);

  const rowStart = Math.max(0, Math.floor(minY));
  const rowEnd = Math.min(size - 1, Math.ceil(maxY));
  let painted = false;
  let next = 0;
  const active: number[] = [];
  const xs: number[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const y = row + 0.5;
    /* この行に達した辺を取り込む（y0 <= y） */
    while (next < n && ey0[order[next]] <= y) {
      active.push(order[next]);
      next += 1;
    }
    /* この行を抜けた辺を外す（y1 <= y。半開区間の上側） */
    let kept = 0;
    xs.length = 0;
    for (let k = 0; k < active.length; k++) {
      const e = active[k];
      if (ey1[e] <= y) continue;
      active[kept++] = e;
      xs.push(ex[e] + (y - ey0[e]) * slope[e]);
    }
    active.length = kept;
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      /* 画素の中心が [xa, xb) に入る列を塗る */
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(size, Math.ceil(xs[k + 1] - 0.5));
      if (from >= to) continue;
      painted = true;
      /* 1 画素 = 32 ビット 1 語。fill はネイティブで、1 バイトずつ書くより
         ずっと速い */
      pixels.fill(packed, row * size + from, row * size + to);
    }
  }
  return painted;
}

/**
 * RGBA 4 バイトを、この環境の並びで 32 ビット 1 語に詰める。
 *
 * Uint32Array はホストのエンディアンで読み書きするので、リトルエンディアン
 * （x86・ARM の通常）では A が上位。**決め打ちしない。**1 語書いて
 * バイト列で読み、どちらかを確かめる。
 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function packRgba(r: number, g: number, b: number, a: number): number {
  return LITTLE_ENDIAN
    ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

/** `factor` 倍で描いた絵を 1/factor に平均する。透明は透明のまま。 */
function downsample(
  src: Uint8ClampedArray,
  srcSize: number,
  factor: number,
): Uint8ClampedArray {
  const size = srcSize / factor;
  const out = new Uint8ClampedArray(size * size * 4);
  const samples = factor * factor;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const at = ((y * factor + dy) * srcSize + (x * factor + dx)) * 4;
          const alpha = src[at + 3];
          if (alpha === 0) continue;
          /* 色は不透明な標本だけで平均する。透明（黒）を混ぜると縁が
             黒ずむ */
          r += src[at] * alpha;
          g += src[at + 1] * alpha;
          b += src[at + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * size + x) * 4;
      if (a === 0) continue;
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / samples);
    }
  }
  return out;
}

/**
 * タイル 1 枚ぶんを塗って RGBA（`TILE_SIZE` 四方）で返す。
 *
 * 描く順は `features` の順。重なりは後の区画が勝つ（上流の並びを尊重
 * する。用途地域は原則として重ならない）。
 */
export function rasterizeTile(
  features: readonly FillFeature[],
  z: number,
  tileX: number,
  tileY: number,
  stats?: RasterStats,
  supersample = 2,
): Uint8ClampedArray {
  const factor = Math.max(1, Math.floor(supersample));
  const size = TILE_SIZE * factor;
  const pixels = new Uint8ClampedArray(size * size * 4);
  /* 同じメモリを 32 ビットの語として見る。塗りは語単位、平均はバイト単位 */
  const words = new Uint32Array(pixels.buffer);

  for (const f of features) {
    const rgb = parseHexColor(f.fill);
    if (!rgb) {
      if (stats) stats.skippedColor += 1;
      continue;
    }
    const g = f.geometry;
    let polygons: Position[][][];
    if (g?.type === "Polygon") {
      polygons = [g.coordinates as Position[][]];
    } else if (g?.type === "MultiPolygon") {
      polygons = g.coordinates as Position[][][];
    } else {
      if (stats) stats.skippedGeometry += 1;
      continue;
    }
    const packed = packRgba(rgb[0], rgb[1], rgb[2], 255);
    let painted = false;
    for (const rings of polygons) {
      const projected = rings.map((ring) =>
        projectRing(ring, z, tileX, tileY, size),
      );
      if (fillPolygon(projected, size, packed, words)) painted = true;
    }
    if (painted && stats) stats.painted += 1;
  }

  return factor === 1 ? pixels : downsample(pixels, size, factor);
}
