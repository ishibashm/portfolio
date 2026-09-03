import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crc32,
  encodePng,
  fillPolygon,
  hexToRgb,
  mercatorX,
  mercatorY,
  projectRing,
  rasterizeZoning,
  sourceTilesFor,
  ZONING_TILE_SIZE,
} from "@/lib/zoningRaster";
import {
  isZoningRasterZoom,
  MUTED_ZONING_FILL,
  ZONING_FILL,
  ZONING_MIN_ZOOM,
  ZONING_RASTER_DISPLAY_MIN_ZOOM,
  ZONING_RASTER_MAX_ZOOM,
  ZONING_RASTER_MIN_ZOOM,
  ZONING_UPSTREAM_MIN_ZOOM,
} from "@/utils/zoning";
import type { RawZoningFeature } from "@/lib/zoningUpstream";

/**
 * 用途地域を広い縮尺で画像タイルとして出す件。
 *
 * 利用者の要望：「用途地域をできる限り俯瞰でも表示できるようにして
 * ほしい。速度は落とさず」。多角形（GeoJSON）の下限 z13 は受け取る
 * 大きさの実測で決まっていて、それより広い縮尺は**サーバーで塗った
 * PNG**を貼る。ここは塗る側（純粋関数）と、ズームの取り決めの検査。
 */

/* ---------- ズームの取り決め ---------- */

describe("画像タイルのズーム範囲", () => {
  it("多角形の下限のすぐ下で、重ならない", () => {
    expect(ZONING_RASTER_MAX_ZOOM).toBe(ZONING_MIN_ZOOM - 1);
    expect(isZoningRasterZoom(ZONING_MIN_ZOOM)).toBe(false);
    expect(isZoningRasterZoom(ZONING_RASTER_MAX_ZOOM)).toBe(true);
  });

  it("焼くのは z11 から。z10 は口としては断る", () => {
    /* z10 は Leaflet が z11 のタイルを縮めて描く（minNativeZoom）。
       サーバーに z10 の要求は来ない */
    expect(ZONING_RASTER_MIN_ZOOM).toBe(11);
    expect(isZoningRasterZoom(11)).toBe(true);
    expect(isZoningRasterZoom(10)).toBe(false);
    expect(isZoningRasterZoom(11.5)).toBe(false);
  });

  it("画面に出す下限は、焼く下限より 1 段だけ広い", () => {
    /* 1 段ごとに上流から取るタイルが 4 倍になる。z9 まで下げない */
    expect(ZONING_RASTER_DISPLAY_MIN_ZOOM).toBe(ZONING_RASTER_MIN_ZOOM - 1);
    expect(ZONING_RASTER_DISPLAY_MIN_ZOOM).toBe(10);
  });

  it("上流へ直接投げるのは実測で確かめた z11 以上", () => {
    /* probe（run 33806982160）で z11 が 1,715 件・3.6MB で返ることを確認。
       下げるなら scripts/probe_zoning.ts で上流の応答を確かめてから */
    expect(ZONING_UPSTREAM_MIN_ZOOM).toBe(11);
  });
});

describe("子タイルの一覧", () => {
  it("要求が上流の下限以上なら、そのまま 1 枚", () => {
    expect(sourceTilesFor(12, 3638, 1612, 12)).toEqual([[12, 3638, 1612]]);
    expect(sourceTilesFor(14, 1, 2, 12)).toEqual([[14, 1, 2]]);
  });

  it("上流の下限が z11 なので、z11 もそのまま 1 枚", () => {
    expect(sourceTilesFor(11, 1819, 806, ZONING_UPSTREAM_MIN_ZOOM)).toEqual([
      [11, 1819, 806],
    ]);
  });

  it("下限が z12 だったころは子 4 枚に割れていた（組み立ては働く）", () => {
    const tiles = sourceTilesFor(11, 1819, 806, 12);
    expect(tiles).toHaveLength(4);
    expect(tiles).toEqual(
      expect.arrayContaining([
        [12, 3638, 1612],
        [12, 3639, 1612],
        [12, 3638, 1613],
        [12, 3639, 1613],
      ]),
    );
  });

  it("z10 なら 16 枚になる（だから出していない）", () => {
    expect(sourceTilesFor(10, 0, 0, 12)).toHaveLength(16);
  });
});

/* ---------- 投影 ---------- */

describe("経緯度 → タイル画素", () => {
  it("タイルの四隅が 0 と 256 に落ちる", () => {
    const z = 12;
    const x = 3638;
    const y = 1612;
    /* タイルの西端・北端の経緯度を逆算して投影し直す */
    const west = (x / 2 ** z) * 360 - 180;
    const east = ((x + 1) / 2 ** z) * 360 - 180;
    const north =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
    const south =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / 2 ** z))) * 180) /
      Math.PI;
    const ring = projectRing(
      [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
      z,
      x,
      y,
    );
    expect(ring[0][0]).toBeCloseTo(0, 6);
    expect(ring[0][1]).toBeCloseTo(0, 6);
    expect(ring[2][0]).toBeCloseTo(ZONING_TILE_SIZE, 6);
    expect(ring[2][1]).toBeCloseTo(ZONING_TILE_SIZE, 6);
  });

  it("東京駅は z12 の 3638/1612 のタイルに入る", () => {
    expect(Math.floor(mercatorX(139.7671, 12))).toBe(3638);
    expect(Math.floor(mercatorY(35.6812, 12))).toBe(1612);
  });

  it("読めない座標は捨てる（落ちない）", () => {
    expect(projectRing([[NaN, 35], [139]], 12, 0, 0)).toEqual([]);
  });
});

/* ---------- 塗り ---------- */

const px = (rgba: Uint8ClampedArray, x: number, y: number) => {
  const o = (y * ZONING_TILE_SIZE + x) * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]];
};

describe("多角形の塗り（偶奇規則）", () => {
  it("四角形の中だけ塗り、外は透明のまま", () => {
    const rgba = new Uint8ClampedArray(ZONING_TILE_SIZE ** 2 * 4);
    fillPolygon(
      rgba,
      ZONING_TILE_SIZE,
      [
        [
          [10, 10],
          [50, 10],
          [50, 40],
          [10, 40],
        ],
      ],
      [255, 0, 0],
    );
    expect(px(rgba, 30, 25)).toEqual([255, 0, 0, 255]);
    expect(px(rgba, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(px(rgba, 5, 25)).toEqual([0, 0, 0, 0]);
    expect(px(rgba, 30, 45)).toEqual([0, 0, 0, 0]);
    expect(px(rgba, 60, 25)).toEqual([0, 0, 0, 0]);
  });

  it("穴（内側の輪）は抜ける", () => {
    const rgba = new Uint8ClampedArray(ZONING_TILE_SIZE ** 2 * 4);
    fillPolygon(
      rgba,
      ZONING_TILE_SIZE,
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        [
          [40, 40],
          [60, 40],
          [60, 60],
          [40, 60],
        ],
      ],
      [0, 0, 255],
    );
    expect(px(rgba, 20, 20)).toEqual([0, 0, 255, 255]);
    expect(px(rgba, 50, 50)).toEqual([0, 0, 0, 0]);
  });

  it("タイルの外にはみ出す輪は、はみ出したぶんを切る（落ちない）", () => {
    const rgba = new Uint8ClampedArray(ZONING_TILE_SIZE ** 2 * 4);
    fillPolygon(
      rgba,
      ZONING_TILE_SIZE,
      [
        [
          [-100, -100],
          [50, -100],
          [50, 50],
          [-100, 50],
        ],
      ],
      [0, 255, 0],
    );
    expect(px(rgba, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(px(rgba, 49, 49)).toEqual([0, 255, 0, 255]);
    expect(px(rgba, 50, 50)).toEqual([0, 0, 0, 0]);
  });
});

/* ---------- 区画 → 絵 ---------- */

/** タイル (z,x,y) の画素矩形 [px0,py0]-[px1,py1] を経緯度の輪にする。 */
function ringOfPixels(
  z: number,
  x: number,
  y: number,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
): number[][] {
  const lon = (p: number) => ((x + p / 256) / 2 ** z) * 360 - 180;
  const lat = (p: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + p / 256)) / 2 ** z))) * 180) /
    Math.PI;
  return [
    [lon(px0), lat(py0)],
    [lon(px1), lat(py0)],
    [lon(px1), lat(py1)],
    [lon(px0), lat(py1)],
    [lon(px0), lat(py0)],
  ];
}

const Z = 11;
const X = 1819;
const Y = 806;

function feature(
  name: string,
  ring: number[][],
  extra: Partial<RawZoningFeature> = {},
): RawZoningFeature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { use_area_ja: name },
    ...extra,
  };
}

describe("区画を塗る", () => {
  it("区分の色で塗る（GeoJSON の層と同じ色）", () => {
    const rgba = rasterizeZoning(
      [feature("商業地域", ringOfPixels(Z, X, Y, 20, 20, 80, 80))],
      Z,
      X,
      Y,
    );
    expect(px(rgba, 50, 50)).toEqual([...hexToRgb(ZONING_FILL.商業地域), 255]);
    expect(px(rgba, 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it("1 区分だけ残すと、他は灰色に落ちる（消さない）", () => {
    const rgba = rasterizeZoning(
      [
        feature("商業地域", ringOfPixels(Z, X, Y, 0, 0, 100, 100)),
        feature("工業地域", ringOfPixels(Z, X, Y, 150, 150, 250, 250)),
      ],
      Z,
      X,
      Y,
      { only: "商業地域" },
    );
    expect(px(rgba, 50, 50)).toEqual([...hexToRgb(ZONING_FILL.商業地域), 255]);
    expect(px(rgba, 200, 200)).toEqual([...hexToRgb(MUTED_ZONING_FILL), 255]);
  });

  it("z12 の子タイルの区画を、z11 の親タイルの位置に置ける", () => {
    /* 親 (11, 1819, 806) の右下の子は (12, 3639, 1613)。その子の左上
       64 画素四方は、親では右下の 4 分の 1 の左上 32 画素四方 */
    const rgba = rasterizeZoning(
      [feature("工業専用地域", ringOfPixels(12, 3639, 1613, 0, 0, 64, 64))],
      Z,
      X,
      Y,
    );
    const c = [...hexToRgb(ZONING_FILL.工業専用地域), 255];
    expect(px(rgba, 130, 130)).toEqual(c);
    expect(px(rgba, 158, 158)).toEqual(c);
    expect(px(rgba, 170, 170)).toEqual([0, 0, 0, 0]);
    expect(px(rgba, 100, 100)).toEqual([0, 0, 0, 0]);
  });

  it("MultiPolygon と知らない型", () => {
    const rgba = rasterizeZoning(
      [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [ringOfPixels(Z, X, Y, 0, 0, 20, 20)],
              [ringOfPixels(Z, X, Y, 200, 200, 220, 220)],
            ],
          },
          properties: { use_area_ja: "準工業地域" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [139, 35] },
          properties: { use_area_ja: "商業地域" },
        },
      ],
      Z,
      X,
      Y,
    );
    const c = [...hexToRgb(ZONING_FILL.準工業地域), 255];
    expect(px(rgba, 10, 10)).toEqual(c);
    expect(px(rgba, 210, 210)).toEqual(c);
    /* Point は描かれない。落ちもしない */
    expect(px(rgba, 100, 100)).toEqual([0, 0, 0, 0]);
  });
});

/* ---------- PNG ---------- */

describe("PNG の書き出し", () => {
  it("正しい PNG で、画素が往復する", () => {
    const w = 4;
    const h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = i * 20;
      rgba[i * 4 + 1] = 255 - i * 20;
      rgba[i * 4 + 2] = 7;
      rgba[i * 4 + 3] = i % 2 ? 255 : 0;
    }
    const png = encodePng(rgba, w, h);

    /* 署名 */
    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    /* IHDR: 長さ 13、幅・高さ、8 ビット、RGBA */
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(w);
    expect(png.readUInt32BE(20)).toBe(h);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    /* IHDR の CRC が合っている */
    expect(png.readUInt32BE(29)).toBe(crc32(png.subarray(12, 29)));

    /* IDAT を膨らませて、行フィルタ 0 を挟んだ画素に戻る */
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe((w * 4 + 1) * h);
    for (let row = 0; row < h; row++) {
      expect(raw[row * (w * 4 + 1)]).toBe(0);
      const line = raw.subarray(row * (w * 4 + 1) + 1, (row + 1) * (w * 4 + 1));
      expect([...line]).toEqual([
        ...rgba.subarray(row * w * 4, (row + 1) * w * 4),
      ]);
    }
    /* 末尾は IEND */
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe(
      "IEND",
    );
  });

  it("空のタイルは小さい（数百バイト）", () => {
    const rgba = new Uint8ClampedArray(ZONING_TILE_SIZE ** 2 * 4);
    expect(
      encodePng(rgba, ZONING_TILE_SIZE, ZONING_TILE_SIZE).length,
    ).toBeLessThan(1000);
  });

  it("13 色の塗り分けでも 1 タイル 20KB 前後に収まる", () => {
    /* 市街地の代わりに 8×8 の升目で 13 色を並べる（実物より刻みは細かい） */
    const rgba = new Uint8ClampedArray(ZONING_TILE_SIZE ** 2 * 4);
    const colors = Object.values(ZONING_FILL).map(hexToRgb);
    let k = 0;
    for (let gy = 0; gy < 32; gy++) {
      for (let gx = 0; gx < 32; gx++) {
        fillPolygon(
          rgba,
          ZONING_TILE_SIZE,
          [
            [
              [gx * 8, gy * 8],
              [gx * 8 + 8, gy * 8],
              [gx * 8 + 8, gy * 8 + 8],
              [gx * 8, gy * 8 + 8],
            ],
          ],
          colors[k++ % colors.length],
        );
      }
    }
    expect(
      encodePng(rgba, ZONING_TILE_SIZE, ZONING_TILE_SIZE).length,
    ).toBeLessThan(30_000);
  });

  it("画素数が合わなければ投げる", () => {
    expect(() => encodePng(new Uint8ClampedArray(10), 2, 2)).toThrow();
  });
});

/* ---------- 口（route） ---------- */

describe("/api/zoning/raster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    /* unstable_cache は next/cache の実体を要るので、素通しに差し替える */
    vi.doMock("next/cache", () => ({
      unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
    }));
    return await import("@/app/api/zoning/raster/route");
  }

  it("z11 は上流に 1 回だけ取りに行き、PNG を返す", async () => {
    vi.stubEnv("LIBRARY_API_KEY", "test");
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(url);
        const u = new URL(url);
        const sz = Number(u.searchParams.get("z"));
        const sx = Number(u.searchParams.get("x"));
        const sy = Number(u.searchParams.get("y"));
        /* 右下の 4 分の 1 だけ区画がある。上流は z11 をそのまま返す */
        if (sz === 11 && sx === 1819 && sy === 806) {
          return new Response(
            JSON.stringify({
              type: "FeatureCollection",
              features: [
                feature(
                  "商業地域",
                  ringOfPixels(11, 1819, 806, 128, 128, 256, 256),
                ),
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("", { status: 404 });
      }),
    );
    const { GET } = await load();
    const res = await GET(
      new Request("http://localhost/api/zoning/raster?z=11&x=1819&y=806"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("z=11");

    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    /* 右下の 4 分の 1 だけ塗られている */
    const idatLen = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    const at = (x: number, y: number) => raw[y * (256 * 4 + 1) + 1 + x * 4 + 3];
    expect(at(200, 200)).toBe(255);
    expect(at(50, 50)).toBe(0);
  });

  it("多角形の縮尺（z13）や z10 は断る", async () => {
    vi.stubEnv("LIBRARY_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await load();
    for (const z of [10, 13]) {
      const res = await GET(
        new Request(`http://localhost/api/zoning/raster?z=${z}&x=0&y=0`),
      );
      expect(res.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("鍵が無ければ 503、上流が落ちれば 502", async () => {
    vi.stubEnv("LIBRARY_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    let mod = await load();
    let res = await mod.GET(
      new Request("http://localhost/api/zoning/raster?z=12&x=3638&y=1612"),
    );
    expect(res.status).toBe(503);

    vi.resetModules();
    vi.stubEnv("LIBRARY_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    mod = await load();
    res = await mod.GET(
      new Request("http://localhost/api/zoning/raster?z=12&x=3638&y=1612"),
    );
    expect(res.status).toBe(502);
  });
});
