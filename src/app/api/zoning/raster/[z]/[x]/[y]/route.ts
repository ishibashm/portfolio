import { NextResponse } from "next/server";
import { toLogMessage } from "@/lib/errorMessage";
import { encodePngRgba } from "@/lib/png";
import {
  rasterizeTile,
  TILE_SIZE,
  type FillFeature,
  type RasterStats,
} from "@/lib/rasterTile";
import {
  isTileCoordinate,
  isZoningName,
  isZoningRasterZoom,
  zoningRasterFill,
  ZONING_RASTER_MAX_ZOOM,
  ZONING_RASTER_MIN_ZOOM,
  type ZoningName,
} from "@/utils/zoning";

/**
 * 用途地域を**塗り絵（PNG タイル）**で 1 枚ぶん返す。俯瞰用。
 *
 * `/api/zoning`（多角形の中継）と同じ上流（不動産情報ライブラリ
 * `XKT002`）を読み、**多角形を送る代わりにサーバで塗って**返す。
 * z11〜12 では多角形が 1 画面 6.5MB（`utils/zoning` の実測表）になる
 * うえ、ブラウザが数千の SVG パスを描くことになる。塗り絵なら
 * 256 画素四方の PNG は数 KB〜十数 KB で、ブラウザは画像タイルとして
 * 置くだけ（`lib/rasterTile` に理由）。
 *
 * ## 判定には入らない
 *
 * 用途地域は参考として重ねる層。吉凶の判定とは無関係。
 *
 * ## 上流を叩く回数を抑える
 *
 * 上流 1 タイルは z12 で最大 1.9MB、z11 はその数倍になる（千代田区。
 * z11 は未計測）。塗った PNG は小さいので、**塗った結果のほうを覚える**
 * （プロセス内の LRU）。同じタイルの要求が同時に来たら 1 回の取得に
 * 相乗りさせ、上流への同時接続は `UPSTREAM_CONCURRENCY` までに絞る。
 * 応答には `Cache-Control` を付けて、ブラウザにも 1 日持たせる。
 *
 * Next の fetch キャッシュ（`next: { revalidate }`）も掛けてあるが、
 * 2MB を超える応答は Next が覚えない（z11 はそうなりうる）ので、
 * それだけに頼らない。
 *
 * ## 絞り込み
 *
 * `?pick=<区分名>` で 1 区分だけ元の色、他を灰色にした絵を返す。
 * 画面の凡例と同じ規則（`zoningRasterFill` → `zoningFillFiltered`）。
 * 知らない名前は 400。黙って全部の色で返すと「絞れていない」ことに
 * 気付けない。
 *
 * ## 判定に無い区分が来たら
 *
 * 灰色（`UNKNOWN_ZONING_FILL`）で塗る。多角形の層と同じ扱い。
 */

/** 30 日。`/api/zoning` と同じ理由（用途地域の変更は年に数回）。 */
export const revalidate = 2592000;

const ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external/XKT002";

/** 上流へ同時に開く接続の上限。多角形の層がブラウザ側で 4 にしているのと合わせる。 */
const UPSTREAM_CONCURRENCY = 4;

/** 覚えておく PNG の枚数。1 枚 10KB 前後なので 2,000 枚で 20MB ほど。 */
const PNG_CACHE_MAX = 2000;

/** ブラウザに 1 日、共有キャッシュに 30 日。失敗の応答には付けない。 */
const CACHE_HEADER =
  "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400";

interface RawFeature {
  type?: string;
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

/* ---- プロセス内キャッシュ ---------------------------------------- */

const pngCache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const hit = pngCache.get(key);
  if (hit) {
    /* 使ったものを末尾へ。Map は挿入順を保つので、先頭が最も古い */
    pngCache.delete(key);
    pngCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: Buffer) {
  pngCache.set(key, value);
  while (pngCache.size > PNG_CACHE_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest === undefined) break;
    pngCache.delete(oldest);
  }
}

/* ---- 上流の取得（相乗り＋同時数の上限） --------------------------- */

/** 取得中の約束。同じタイルを同時に頼まれたら同じ約束を返す。 */
const inflight = new Map<string, Promise<RawFeature[] | null>>();

let running = 0;
const waiting: (() => void)[] = [];

async function withUpstreamSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= UPSTREAM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

/**
 * 上流から 1 タイルの区画を取る。
 *
 *   - 配列 … 取れた（都市計画の決定が無い場所は空配列）
 *   - null … 取れなかった（上流の失敗）。**覚えない**
 */
async function fetchUpstream(
  z: number,
  x: number,
  y: number,
  apiKey: string,
): Promise<RawFeature[] | null> {
  const key = `${z}/${x}/${y}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = withUpstreamSlot(async () => {
    const url = `${ENDPOINT}?response_format=geojson&z=${z}&x=${x}&y=${y}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey, Accept: "*/*" },
        next: { revalidate },
      });
    } catch (e) {
      console.error("用途地域（塗り絵）の取得に失敗:", toLogMessage(e));
      return null;
    }
    /* そのタイルに都市計画の決定が無い（都市計画区域の外など）。失敗ではない */
    if (res.status === 404) return [];
    if (!res.ok) {
      console.error(
        `用途地域（塗り絵）: 上流が ${res.status} ${res.statusText}`,
      );
      return null;
    }
    try {
      const body = (await res.json()) as { features?: RawFeature[] };
      return body.features ?? [];
    } catch (e) {
      console.error(
        "用途地域（塗り絵）: JSON として読めない:",
        toLogMessage(e),
      );
      return null;
    }
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

/* ---- 応答 ------------------------------------------------------- */

function pngResponse(png: Buffer, cacheable: boolean): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": cacheable ? CACHE_HEADER : "no-store",
    },
  });
}

/** 何も無いタイル。1 度作って使い回す。 */
let emptyPng: Buffer | null = null;
function emptyTile(): Buffer {
  if (!emptyPng) {
    emptyPng = encodePngRgba(
      TILE_SIZE,
      TILE_SIZE,
      new Uint8Array(TILE_SIZE * TILE_SIZE * 4),
    );
  }
  return emptyPng;
}

function parseIndex(value: string): number | null {
  return /^\d{1,7}$/.test(value) ? Number(value) : null;
}

type Params = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(request: Request, { params }: Params) {
  const p = await params;
  const z = parseIndex(p.z);
  const x = parseIndex(p.x);
  const y = parseIndex(p.y);

  /*
    画像タイルの応答なので、失敗の本文は誰も読まない（<img> は中身を
    見せない）。状態番号だけ正しく返し、理由はログに残す。
  */
  if (z === null || x === null || y === null || !isTileCoordinate(z, x, y)) {
    return new Response(null, { status: 400 });
  }
  if (!isZoningRasterZoom(z)) {
    return NextResponse.json(
      {
        error: "この縮尺では塗り絵を出していません。",
        minZoom: ZONING_RASTER_MIN_ZOOM,
        maxZoom: ZONING_RASTER_MAX_ZOOM,
      },
      { status: 400 },
    );
  }

  const pickRaw = new URL(request.url).searchParams.get("pick");
  let pick: ZoningName | null = null;
  if (pickRaw !== null && pickRaw !== "") {
    if (!isZoningName(pickRaw)) {
      return new Response(null, { status: 400 });
    }
    pick = pickRaw;
  }

  const cacheKey = `${z}/${x}/${y}?${pick ?? ""}`;
  const cached = cacheGet(cacheKey);
  if (cached) return pngResponse(cached, true);

  const apiKey = process.env.LIBRARY_API_KEY;
  if (!apiKey) {
    console.error("用途地域（塗り絵）: LIBRARY_API_KEY が未設定");
    return new Response(null, { status: 503 });
  }

  const features = await fetchUpstream(z, x, y, apiKey);
  if (features === null) {
    return new Response(null, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let png: Buffer;
  if (features.length === 0) {
    png = emptyTile();
  } else {
    const fills: FillFeature[] = features.map((f) => ({
      geometry: f.geometry,
      fill: zoningRasterFill(f.properties, pick),
    }));
    const stats: RasterStats = {
      painted: 0,
      skippedGeometry: 0,
      skippedColor: 0,
    };
    const pixels = rasterizeTile(fills, z, x, y, stats);
    if (stats.skippedGeometry > 0 || stats.skippedColor > 0) {
      /* 黙って減らさない。上流が知らない形を返し始めたら、ここに出る */
      console.warn(
        `用途地域（塗り絵）${cacheKey}: 飛ばした区画 geometry ${stats.skippedGeometry} / 色 ${stats.skippedColor}`,
      );
    }
    png = encodePngRgba(TILE_SIZE, TILE_SIZE, pixels);
  }

  cacheSet(cacheKey, png);
  return pngResponse(png, true);
}
