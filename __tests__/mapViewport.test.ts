import { describe, expect, it } from "vitest";
import { hasRenderedBox, readMapViewport } from "@/utils/mapViewport";

/**
 * 「地図では 303 件、一覧に切り替えると 0 件」という利用者報告の再現。
 *
 * スマホで一覧に切り替えると地図の器が display:none になる。Leaflet は
 * そのとき自分の大きさを 0×0 と測り、getBounds() は**南西と北東が同じ
 * 一点**に潰れた範囲を返す。その範囲がそのまま絞り込みに流れると、
 * どの物件も範囲内に入らず 0 件になる。
 *
 * 「地図」に戻すと直っていたのは、戻すボタンが window の resize を流して
 * 測り直させていたから。出ていく側だけが無防備だった。
 */

/** Leaflet の地図のうち、readMapViewport が読む所だけを写した替え玉。 */
function fakeMap(opts: {
  size: { x: number; y: number };
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
  zoom: number;
}) {
  return {
    getSize: () => opts.size,
    getBounds: () => ({
      getSouthWest: () => opts.sw,
      getNorthEast: () => opts.ne,
    }),
    getZoom: () => opts.zoom,
  };
}

/** 画面に見えている地図（東京駅あたりを 1 画面ぶん）。 */
const VISIBLE = fakeMap({
  size: { x: 390, y: 600 },
  sw: { lat: 35.66, lng: 139.72 },
  ne: { lat: 35.71, lng: 139.79 },
  zoom: 14,
});

/**
 * 一覧に切り替えて display:none になった地図。
 * 大きさが 0×0 で、範囲は中心の一点に潰れている。
 */
const HIDDEN = fakeMap({
  size: { x: 0, y: 0 },
  sw: { lat: 35.685, lng: 139.755 },
  ne: { lat: 35.685, lng: 139.755 },
  zoom: 14,
});

describe("hasRenderedBox", () => {
  it("見えている器は真", () => {
    expect(hasRenderedBox({ x: 390, y: 600 })).toBe(true);
  });

  it("display:none の器（0×0）は偽", () => {
    expect(hasRenderedBox({ x: 0, y: 0 })).toBe(false);
  });

  it("片方だけ 0 でも偽", () => {
    expect(hasRenderedBox({ x: 390, y: 0 })).toBe(false);
    expect(hasRenderedBox({ x: 0, y: 600 })).toBe(false);
  });

  it("測れていない値（NaN・null）は偽", () => {
    expect(hasRenderedBox({ x: NaN, y: 600 })).toBe(false);
    expect(hasRenderedBox(null)).toBe(false);
    expect(hasRenderedBox(undefined)).toBe(false);
  });
});

describe("readMapViewport", () => {
  it("見えている地図では範囲を返す", () => {
    expect(readMapViewport(VISIBLE)).toEqual({
      minLat: 35.66,
      maxLat: 35.71,
      minLon: 139.72,
      maxLon: 139.79,
      zoom: 14,
    });
  });

  it("隠れている地図では null を返す（潰れた範囲を流さない）", () => {
    expect(readMapViewport(HIDDEN)).toBeNull();
  });
});

describe("報告された症状の再現", () => {
  /** 一覧の「候補のうち範囲内」と同じ数え方。 */
  const inBounds = (
    rows: { lat: number; lon: number }[],
    box: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  ) =>
    rows.filter(
      (d) =>
        d.lat >= box.minLat &&
        d.lat <= box.maxLat &&
        d.lon >= box.minLon &&
        d.lon <= box.maxLon,
    );

  /**
   * 画面に出ていた 303 件のかわり。範囲の中に散らばらせる。
   * 刻みを半端にしてあるのは、潰れた範囲の一点（中心）に格子が
   * ちょうど乗らないようにするため。乗ると 2 件だけ拾って
   * 「0 件になる」の再現が崩れる（実際に最初そうなった）。
   */
  const ROWS = Array.from({ length: 303 }, (_, i) => ({
    lat: 35.6712 + (i % 30) * 0.0011,
    lon: 139.7318 + (i % 40) * 0.0009,
  }));

  it("見えている地図の範囲なら 303 件そのまま数えられる", () => {
    const viewport = readMapViewport(VISIBLE);
    expect(viewport).not.toBeNull();
    expect(inBounds(ROWS, viewport!)).toHaveLength(303);
  });

  it("潰れた範囲を使うと 0 件になる（これが報告された症状）", () => {
    // readMapViewport を通さず、隠れた地図の範囲を直に使った場合
    const collapsed = {
      minLat: 35.685,
      maxLat: 35.685,
      minLon: 139.755,
      maxLon: 139.755,
    };
    expect(inBounds(ROWS, collapsed)).toHaveLength(0);
  });

  it("隠れた地図からは範囲を取り出せないので、前の範囲が保たれる", () => {
    // 受け取る側は null のとき更新しない。だから 303 件のままになる
    const last = readMapViewport(VISIBLE)!;
    const next = readMapViewport(HIDDEN) ?? last;
    expect(next).toEqual(last);
    expect(inBounds(ROWS, next)).toHaveLength(303);
  });
});
