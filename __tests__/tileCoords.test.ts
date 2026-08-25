/**
 * 緯度経度 → タイル座標の変換を固定する。
 *
 * この計算は**壊れても静かに壊れる。**`Math.tan` が発散すると x/y が
 * NaN になり、タイル URL が "NaN" を含む文字列になって 404 する。
 * Leaflet は 404 を透明として扱い、`<img>` は壊れた絵になるだけで、
 * どちらもエラーを出さない。だから数値で押さえる。
 *
 * 元は `ZoningLayer.tsx` の中の private な関数だった。航空写真の
 * 切り出しが同じ計算を要るので 1 か所に出した（CLAUDE.md 3 節
 * 「同じことを 2 か所に書かない」）。**移す前と同じ答えを返すこと**を
 * ここで固定する。
 */
import { describe, expect, it } from "vitest";

import {
  AERIAL_MAX_ZOOM,
  MERCATOR_MAX_LAT,
  aerialPhotoUrl,
  latToTileY,
  lonToTileX,
  tilePointOf,
} from "@/lib/tileCoords";

/** 移す前の実装（ZoningLayer.tsx にあったもの）。答えが変わっていないか見る。 */
function legacyLonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function legacyLatToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
  );
}

/** 日本のあちこち。用途地域は z14〜18 で引く。 */
const PLACES: [string, number, number][] = [
  ["東京駅", 35.6812, 139.7671],
  ["札幌駅", 43.0686, 141.3508],
  ["那覇", 26.2124, 127.6809],
  ["石垣", 24.3448, 124.1572],
  ["根室", 43.33, 145.5827],
  ["京都駅", 34.9858, 135.7588],
];

describe("タイル座標の変換", () => {
  it("移す前の実装と同じ答えを返す", () => {
    for (const [, lat, lon] of PLACES) {
      for (let z = 2; z <= 18; z++) {
        expect(lonToTileX(lon, z)).toBe(legacyLonToTileX(lon, z));
        expect(latToTileY(lat, z)).toBe(legacyLatToTileY(lat, z));
      }
    }
  });

  it("整数部が lonToTileX / latToTileY と一致する", () => {
    for (const [, lat, lon] of PLACES) {
      for (const z of [14, 16, 18]) {
        const p = tilePointOf(lat, lon, z);
        expect(p.x).toBe(lonToTileX(lon, z));
        expect(p.y).toBe(latToTileY(lat, z));
      }
    }
  });

  it("タイル内の位置は 0 以上 1 未満", () => {
    for (const [, lat, lon] of PLACES) {
      for (const z of [10, 14, 18]) {
        const p = tilePointOf(lat, lon, z);
        expect(p.fx).toBeGreaterThanOrEqual(0);
        expect(p.fx).toBeLessThan(1);
        expect(p.fy).toBeGreaterThanOrEqual(0);
        expect(p.fy).toBeLessThan(1);
      }
    }
  });

  it("z=0 は 1 枚だけ", () => {
    for (const [, lat, lon] of PLACES) {
      const p = tilePointOf(lat, lon, 0);
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    }
  });

  /**
   * 空回りを避けるための固定。
   *
   * 切っていない実装に極を渡すと、**NaN ではなく範囲外の値**が出る
   * （実測 z=10 で 北極 -5686 / 南極 Infinity。正しい範囲は 0〜1023）。
   * URL には数字として入るので、見た目は普通のまま 404 になる。
   */
  it("極を渡しても範囲に収まる（切っていないと外れる）", () => {
    expect(legacyLatToTileY(90, 10)).toBe(-5686);
    expect(legacyLatToTileY(-90, 10)).toBe(Number.POSITIVE_INFINITY);

    for (const lat of [90, -90, 89.9, MERCATOR_MAX_LAT + 1]) {
      const y = latToTileY(lat, 10);
      expect(Number.isNaN(y)).toBe(false);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(2 ** 10);
    }
  });

  it("壊れた入力でも URL に NaN を混ぜない", () => {
    for (const [lat, lon] of [
      [Number.NaN, 139.7],
      [35.6, Number.NaN],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ]) {
      const url = aerialPhotoUrl(lat, lon, 17);
      expect(url).not.toContain("NaN");
      expect(url).not.toContain("Infinity");
    }
  });
});

describe("空中写真の URL", () => {
  it("配信の範囲にズームを丸める", () => {
    expect(aerialPhotoUrl(35.68, 139.76, 99)).toContain(`/${AERIAL_MAX_ZOOM}/`);
    expect(aerialPhotoUrl(35.68, 139.76, -5)).toContain("/2/");
  });

  /** 写真だけ jpg。他の地理院タイルは png なので取り違えると 404 する。 */
  it("拡張子は jpg", () => {
    expect(aerialPhotoUrl(35.68, 139.76, 17).endsWith(".jpg")).toBe(true);
  });

  it("東京駅の z17 のタイルを指す", () => {
    const p = tilePointOf(35.6812, 139.7671, 17);
    expect(aerialPhotoUrl(35.6812, 139.7671, 17)).toBe(
      `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/17/${p.x}/${p.y}.jpg`,
    );
  });
});
