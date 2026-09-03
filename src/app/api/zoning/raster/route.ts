import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchZoningUpstream,
  ZONING_REVALIDATE_SECONDS,
  type RawZoningFeature,
} from "@/lib/zoningUpstream";
import {
  encodePng,
  rasterizeZoning,
  sourceTilesFor,
  ZONING_TILE_SIZE,
} from "@/lib/zoningRaster";
import {
  isTileCoordinate,
  isZoningName,
  isZoningRasterZoom,
  ZONING_RASTER_MAX_ZOOM,
  ZONING_RASTER_MIN_ZOOM,
  ZONING_UPSTREAM_MIN_ZOOM,
} from "@/utils/zoning";

/**
 * 用途地域を**画像タイル**（PNG）で 1 枚ぶん返す。広い縮尺（z11〜12）用。
 *
 * ## なぜ GeoJSON と別の口か
 *
 * `/api/zoning` は多角形をそのまま配る。その下限は z13 で、根拠は
 * 受け取る側の大きさの実測（間引いても z12 で 1 画面 6.5MB。
 * `utils/zoning` に表）。「俯瞰でも用途地域を見たい、ただし速度は
 * 落とさない」という要望に対して、多角形を軽くする方向では届かない。
 * **塗った絵を配る**と 1 タイル数 KB〜20KB で、ブラウザは Leaflet の
 * TileLayer に貼るだけ（描画コスト無し）。
 *
 * ## 上流は z12 の子タイルから組む
 *
 * 上流に投げるのは z12 以上だけ（実測で確かめてある範囲。それより広い
 * 縮尺の応答は確かめておらず、404 が「無い」なのか「非対応」なのか
 * 見分けられない——`lib/zoningUpstream`）。z11 のタイルは z12 の
 * 子 4 枚を取って 1 枚に焼く。
 *
 * 上流への往復は z11 で 1 タイルあたり 4 回。ただし焼いた PNG を
 * 30 日持つ（下の unstable_cache）ので、同じタイルは月に 1 回しか
 * 上流へ行かない。GeoJSON の層は地図を動かすたびに最大 12 枚取りに
 * 行くので、慣らせばこちらのほうが軽い。
 *
 * z10 以下は出さない。z10 は 1 タイルに子 16 枚で、冷えた状態で
 * 1 画面ぶん開くと 300 回超の往復になる。上流が z11 を直接返すと
 * 確かめられたら（`scripts/probe_zoning.ts` の ZOOMS に 11 がある）
 * `ZONING_UPSTREAM_MIN_ZOOM` を 11 に下げるだけで z10 が 4 枚で済む。
 *
 * ## 判定には入らない
 *
 * GeoJSON の層と同じく、参考として重ねる絵。方位の吉凶とは無関係。
 */

const MESSAGES = {
  BAD_TILE: "タイルの指定が正しくありません。",
  ZOOM: "この縮尺の画像タイルは用意していません。",
  NO_KEY: "用途地域の取得が設定されていません。",
  UPSTREAM: "用途地域を取得できませんでした。時間をおいてお試しください。",
} as const;

/** 子タイルを取るときの同時数。上流に一気に投げない。 */
const CONCURRENCY = 4;

type BuildResult =
  | { ok: true; png: string }
  | { ok: false; reason: "no_key" | "upstream" };

async function buildTile(
  z: number,
  x: number,
  y: number,
  only: string,
): Promise<BuildResult> {
  const sources = sourceTilesFor(z, x, y, ZONING_UPSTREAM_MIN_ZOOM);
  const features: RawZoningFeature[] = [];

  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);
    const got = await Promise.all(
      batch.map(([sz, sx, sy]) => fetchZoningUpstream(sz, sx, sy)),
    );
    for (const r of got) {
      if (!r.ok) return { ok: false, reason: r.reason };
      features.push(...r.features);
    }
  }

  const rgba = rasterizeZoning(features, z, x, y, {
    only: isZoningName(only) ? only : null,
  });
  const png = encodePng(rgba, ZONING_TILE_SIZE, ZONING_TILE_SIZE);
  /* unstable_cache は JSON にできる値しか持てないので base64 で渡す */
  return { ok: true, png: png.toString("base64") };
}

/*
  焼いた絵を 30 日持つ。鍵は z/x/y と絞り込み。失敗は持たない
  （持つと 30 日間そのタイルが出ないままになる）。
*/
const cachedTile = unstable_cache(
  async (z: number, x: number, y: number, only: string) => {
    const r = await buildTile(z, x, y, only);
    if (!r.ok) throw new Error(r.reason);
    return r.png;
  },
  ["zoning-raster-v1"],
  { revalidate: ZONING_REVALIDATE_SECONDS },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (
    !searchParams.has("z") ||
    !searchParams.has("x") ||
    !searchParams.has("y")
  ) {
    return NextResponse.json({ error: MESSAGES.BAD_TILE }, { status: 400 });
  }
  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));
  if (!Number.isInteger(z) || !isTileCoordinate(z, x, y)) {
    return NextResponse.json({ error: MESSAGES.BAD_TILE }, { status: 400 });
  }
  if (!isZoningRasterZoom(z)) {
    return NextResponse.json(
      {
        error: MESSAGES.ZOOM,
        minZoom: ZONING_RASTER_MIN_ZOOM,
        maxZoom: ZONING_RASTER_MAX_ZOOM,
      },
      { status: 400 },
    );
  }
  const only = searchParams.get("only") ?? "";

  let base64: string;
  try {
    base64 = await cachedTile(z, x, y, only);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "upstream";
    if (reason === "no_key") {
      return NextResponse.json({ error: MESSAGES.NO_KEY }, { status: 503 });
    }
    return NextResponse.json({ error: MESSAGES.UPSTREAM }, { status: 502 });
  }

  return new NextResponse(Buffer.from(base64, "base64"), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      /* ブラウザは 1 日、CDN は 30 日。用途地域は年に数回しか変わらない */
      "Cache-Control": "public, max-age=86400, s-maxage=2592000",
    },
  });
}
