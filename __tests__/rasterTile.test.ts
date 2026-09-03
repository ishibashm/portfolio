import { describe, expect, it } from "vitest";

import { lonLatOfTileUnits } from "@/lib/tileCoords";
import {
  parseHexColor,
  rasterizeTile,
  TILE_SIZE,
  type FillFeature,
  type RasterStats,
} from "@/lib/rasterTile";

/**
 * 用途地域の塗り絵（俯瞰タイル）を固定する。
 *
 * 多角形を**タイルのどこに**塗るかは、画面の多角形の層（Leaflet が
 * 描く）と同じ場所でなければならない。z12 → z13 で塗り絵から多角形に
 * 切り替わるとき、境目がずれて見えたら気付く人はいない（両方を同時に
 * 見る画面が無い）。だから座標変換は `lib/tileCoords` の 1 つに寄せ、
 * ここではその逆変換で「タイルの西半分」を作って塗り、画素で確かめる。
 */

const Z = 12;
const TX = 3637; // 東京の辺り
const TY = 1612;

/** タイル単位の矩形（このタイルの左上を 0,0 とする）→ GeoJSON の輪 */
function rect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return corners.map(([x, y]) => {
    const { lat, lon } = lonLatOfTileUnits(TX + x, TY + y, Z);
    return [lon, lat];
  });
}

function pixel(px: Uint8ClampedArray, x: number, y: number) {
  const at = (y * TILE_SIZE + x) * 4;
  return [px[at], px[at + 1], px[at + 2], px[at + 3]];
}

const GREEN = "#1B5E20";

describe("parseHexColor", () => {
  it("#RRGGBB を読む。読めなければ null", () => {
    expect(parseHexColor("#1B5E20")).toEqual([0x1b, 0x5e, 0x20]);
    expect(parseHexColor(" #ffffff ")).toEqual([255, 255, 255]);
    expect(parseHexColor("#fff")).toBeNull();
    expect(parseHexColor("green")).toBeNull();
  });
});

describe("rasterizeTile", () => {
  it("タイルの西半分を覆う多角形は、左半分だけを塗る", () => {
    const feature: FillFeature = {
      geometry: { type: "Polygon", coordinates: [rect(0, 0, 0.5, 1)] },
      fill: GREEN,
    };
    const px = rasterizeTile([feature], Z, TX, TY);
    expect(px.length).toBe(TILE_SIZE * TILE_SIZE * 4);
    expect(pixel(px, 64, 128)).toEqual([0x1b, 0x5e, 0x20, 255]);
    expect(pixel(px, 0, 0)).toEqual([0x1b, 0x5e, 0x20, 255]);
    expect(pixel(px, 127, 255)).toEqual([0x1b, 0x5e, 0x20, 255]);
    /* 東半分は透明のまま */
    expect(pixel(px, 128, 128)[3]).toBe(0);
    expect(pixel(px, 192, 128)[3]).toBe(0);
    expect(pixel(px, 255, 0)[3]).toBe(0);
  });

  it("穴は抜ける（偶奇則）", () => {
    const feature: FillFeature = {
      geometry: {
        type: "Polygon",
        coordinates: [rect(0, 0, 1, 1), rect(0.25, 0.25, 0.75, 0.75)],
      },
      fill: GREEN,
    };
    const px = rasterizeTile([feature], Z, TX, TY);
    expect(pixel(px, 128, 128)[3]).toBe(0); // 穴の真ん中
    expect(pixel(px, 16, 16)[3]).toBe(255); // 外周の内側
    expect(pixel(px, 240, 240)[3]).toBe(255);
  });

  it("MultiPolygon も塗る。タイルの外にはみ出す多角形は切り取られる", () => {
    const feature: FillFeature = {
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [rect(-1, -1, 0.25, 0.25)], // 左上の角にだけ掛かる
          [rect(0.75, 0.75, 2, 2)], // 右下の角にだけ掛かる
        ],
      },
      fill: GREEN,
    };
    const stats: RasterStats = {
      painted: 0,
      skippedGeometry: 0,
      skippedColor: 0,
    };
    const px = rasterizeTile([feature], Z, TX, TY, stats);
    expect(pixel(px, 8, 8)[3]).toBe(255);
    expect(pixel(px, 248, 248)[3]).toBe(255);
    expect(pixel(px, 128, 128)[3]).toBe(0);
    expect(stats.painted).toBe(1);
  });

  it("縁は半透明になる（2 倍で描いて平均する）", () => {
    /* 境目を画素の真ん中（x = 0.5 画素）に置く。左の列は半分だけ塗られる */
    const half = 0.5 / TILE_SIZE;
    const feature: FillFeature = {
      geometry: {
        type: "Polygon",
        coordinates: [rect(0, 0, 0.5 + half, 1)],
      },
      fill: GREEN,
    };
    const px = rasterizeTile([feature], Z, TX, TY);
    const edge = pixel(px, 128, 100);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    /* 縁の色は元の色のまま。透明（黒）を混ぜて黒ずませない */
    expect(edge.slice(0, 3)).toEqual([0x1b, 0x5e, 0x20]);
    expect(pixel(px, 127, 100)[3]).toBe(255);
    expect(pixel(px, 129, 100)[3]).toBe(0);
  });

  it("タイルに 1 画素も掛からない多角形は数えない", () => {
    const feature: FillFeature = {
      geometry: { type: "Polygon", coordinates: [rect(3, 3, 4, 4)] },
      fill: GREEN,
    };
    const stats: RasterStats = {
      painted: 0,
      skippedGeometry: 0,
      skippedColor: 0,
    };
    const px = rasterizeTile([feature], Z, TX, TY, stats);
    expect(px.every((v) => v === 0)).toBe(true);
    expect(stats.painted).toBe(0);
  });

  it("知らない形・読めない色は飛ばして数える（黙って減らさない）", () => {
    const stats: RasterStats = {
      painted: 0,
      skippedGeometry: 0,
      skippedColor: 0,
    };
    rasterizeTile(
      [
        { geometry: { type: "Point", coordinates: [139, 35] }, fill: GREEN },
        { geometry: null, fill: GREEN },
        {
          geometry: { type: "Polygon", coordinates: [rect(0, 0, 1, 1)] },
          fill: "green",
        },
      ],
      Z,
      TX,
      TY,
      stats,
    );
    expect(stats.skippedGeometry).toBe(2);
    expect(stats.skippedColor).toBe(1);
    expect(stats.painted).toBe(0);
  });

  it("後に描いた区画が勝つ", () => {
    const px = rasterizeTile(
      [
        {
          geometry: { type: "Polygon", coordinates: [rect(0, 0, 1, 1)] },
          fill: GREEN,
        },
        {
          geometry: { type: "Polygon", coordinates: [rect(0, 0, 0.5, 1)] },
          fill: "#C2185B",
        },
      ],
      Z,
      TX,
      TY,
    );
    expect(pixel(px, 64, 128)).toEqual([0xc2, 0x18, 0x5b, 255]);
    expect(pixel(px, 192, 128)).toEqual([0x1b, 0x5e, 0x20, 255]);
  });

  it("頂点を通る走査線で塗りが反転しない（半開区間）", () => {
    /*
      ひし形。上下の頂点を通る行で交点が二重に数えられると、その行が
      塗られずに横線が抜ける。
    */
    const diamond: [number, number][] = [
      [0.5, 0.1],
      [0.9, 0.5],
      [0.5, 0.9],
      [0.1, 0.5],
      [0.5, 0.1],
    ].map(([x, y]) => {
      const { lat, lon } = lonLatOfTileUnits(TX + x, TY + y, Z);
      return [lon, lat];
    });
    const px = rasterizeTile(
      [{ geometry: { type: "Polygon", coordinates: [diamond] }, fill: GREEN }],
      Z,
      TX,
      TY,
    );
    for (let y = 40; y < 216; y++) {
      expect(pixel(px, 128, y)[3], `行 ${y}`).toBe(255);
    }
  });
});
