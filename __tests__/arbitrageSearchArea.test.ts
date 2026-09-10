import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_AREA,
  initialViewBounds,
  NEARBY_SEARCH_AREA,
  NATIONWIDE_SEARCH_AREA,
  filtersForSearchArea,
  boundsAreaKm2,
  geographyParamsForSearch,
  MAX_AUTO_SCAN_KM2,
  shouldPauseScan,
  normalizeStoredSearchArea,
  searchAreaForFilters,
  searchAreaFromUrl,
} from "@/utils/arbitrageSearchArea";

describe("arbitrage search area", () => {
  it("treats the nearby choice as no prefecture filter within 50 km", () => {
    expect(filtersForSearchArea(NEARBY_SEARCH_AREA)).toEqual({
      prefecture: "all",
      radiusKm: "50",
    });
  });

  it("treats the nationwide choice as no prefecture or radius filter", () => {
    expect(filtersForSearchArea(NATIONWIDE_SEARCH_AREA)).toEqual({
      prefecture: "all",
      radiusKm: "all",
    });
  });

  it("migrates the legacy all choice to the nearby search", () => {
    expect(filtersForSearchArea("all")).toEqual({
      prefecture: "all",
      radiusKm: "50",
    });
  });

  it("treats a prefecture choice as that prefecture without a radius filter", () => {
    expect(filtersForSearchArea("兵庫県")).toEqual({
      prefecture: "兵庫県",
      radiusKm: "all",
    });
  });

  it("shows distinct choices for nearby and nationwide filters", () => {
    expect(searchAreaForFilters("all", "50")).toBe(NEARBY_SEARCH_AREA);
    expect(searchAreaForFilters("all", "all")).toBe(NATIONWIDE_SEARCH_AREA);
    expect(searchAreaForFilters("愛知県", "all")).toBe("愛知県");
  });

  it("restores an explicitly saved nationwide choice", () => {
    expect(
      normalizeStoredSearchArea(NATIONWIDE_SEARCH_AREA, "all", [
        "兵庫県",
        "愛知県",
      ]),
    ).toBe(NATIONWIDE_SEARCH_AREA);
  });

  it("falls back to the unfiltered default when nothing is stored", () => {
    // 一度は近隣50kmを既定にしたが、利用者からは「50km 圏外の物件が最初から
    // 存在しない」ように見える。方位で引越し先を探す道具でそれは筋が悪いので、
    // 既定は上限なしに戻した。速さは地図の表示範囲で担保する。
    expect(normalizeStoredSearchArea(null, "all", ["兵庫県", "愛知県"])).toBe(
      DEFAULT_SEARCH_AREA,
    );
    expect(DEFAULT_SEARCH_AREA).toBe(NATIONWIDE_SEARCH_AREA);
  });

  it("still prefers an explicitly saved prefecture over the default", () => {
    expect(
      normalizeStoredSearchArea(null, "兵庫県", ["兵庫県", "愛知県"]),
    ).toBe("兵庫県");
  });

  it("normalizes URL filters to a choice the screen can represent", () => {
    const validPrefectures = ["兵庫県", "愛知県"];

    expect(searchAreaFromUrl("all", "all", validPrefectures)).toBe(
      NATIONWIDE_SEARCH_AREA,
    );
    expect(searchAreaFromUrl("all", "30", validPrefectures)).toBe(
      NEARBY_SEARCH_AREA,
    );
    expect(searchAreaFromUrl("兵庫県", "50", validPrefectures)).toBe("兵庫県");
    expect(searchAreaFromUrl("未対応県", "all", validPrefectures)).toBeNull();
  });

  it("keeps the selected 50 km radius when map bounds are also sent", () => {
    expect(
      geographyParamsForSearch(filtersForSearchArea(NEARBY_SEARCH_AREA), {
        minLat: 34,
        maxLat: 35,
        minLon: 134,
        maxLon: 135,
        zoom: 10,
      }),
    ).toEqual({
      prefecture: "all",
      radiusKm: "50",
      minLat: "34",
      maxLat: "35",
      minLon: "134",
      maxLon: "135",
    });
  });

  /*
    **俯瞰でも範囲を送る**（2026-09-10）。

    以前は `zoom >= 10` のときだけ付けていた。それが「俯瞰では物件が
    出ない」の原因そのもので、

      範囲を捨てる → API から見れば全国 45 万行の要求 → 重すぎるので
      画面側が要求を打ち切る（scanPaused）

    という循環になっていた。**重いのは俯瞰だからではなく、範囲を
    捨てていたから。**zoom 8 の表示範囲は関東ほどの広さしかない。

    「それでも検索する」（force）を押したときも範囲が付かず、実測
    18.4 秒かけて**画面に写っていない全国の物件**が並んでいた。
  */
  it("俯瞰（zoom 10 未満）でも表示範囲を送る", () => {
    const params = geographyParamsForSearch(
      filtersForSearchArea(NATIONWIDE_SEARCH_AREA),
      { minLat: 34, maxLat: 37, minLon: 133, maxLon: 140, zoom: 7 },
    );
    expect(params.minLat).toBe("34");
    expect(params.maxLat).toBe("37");
    expect(params.minLon).toBe("133");
    expect(params.maxLon).toBe("140");
  });

  it("範囲そのものが無いときだけ、座標を送らない", () => {
    /* 地図が moveend / zoomend を出す前。ここで 0 を入れると
       「赤道付近を検索」になるので、鍵ごと落とすのが正しい。 */
    const params = geographyParamsForSearch(
      filtersForSearchArea(NATIONWIDE_SEARCH_AREA),
      null,
    );
    expect(params).toEqual({ prefecture: "all", radiusKm: "all" });
  });
});

describe("initialViewBounds", () => {
  it("初回検索を出発地の周りに限る", () => {
    // 地図は moveend / zoomend でしか表示範囲を報告しない。既定が上限なしに
    // 戻ったので、これが無いと最初の 1 回だけ全国 45 万行のスキャン
    // （実測 18.4 秒）に落ちる。
    const b = initialViewBounds(34.6913, 135.183);
    expect(b.minLat).toBeLessThan(34.6913);
    expect(b.maxLat).toBeGreaterThan(34.6913);
    expect(b.minLon).toBeLessThan(135.183);
    expect(b.maxLon).toBeGreaterThan(135.183);
  });

  it("矩形が絞り込みとして実際に送られるズームである", () => {
    // geographyParamsForSearch はズーム 10 未満だと矩形を落とす。
    // ここが 10 未満だと種を置いても効かない。
    const b = initialViewBounds(35.6895, 139.6917);
    expect(b.zoom).toBeGreaterThanOrEqual(10);

    const params = geographyParamsForSearch(
      filtersForSearchArea(DEFAULT_SEARCH_AREA),
      b,
    );
    expect(params.radiusKm).toBe("all");
    expect(params.minLat).toBeDefined();
    expect(params.maxLon).toBeDefined();
  });
});

describe("走査を止めるかどうかは面積で決める", () => {
  const NATIONWIDE = filtersForSearchArea(NATIONWIDE_SEARCH_AREA);

  /** 中心 35N の周りに、指定した半幅（度）の矩形を作る。 */
  const box = (latSpan: number, lonSpan: number, zoom: number) => ({
    minLat: 35 - latSpan,
    maxLat: 35 + latSpan,
    minLon: 139 - lonSpan,
    maxLon: 139 + lonSpan,
    zoom,
  });

  it("面積の計算が桁として合っている", () => {
    /* 緯度 1 度 ≒ 111km。35N で経度 1 度 ≒ 91km。
       `box` は**半幅**なので 0.5 を渡すと全幅 1 度四方＝
       111 × 91 ≒ 10,100 km²。 */
    const km2 = boundsAreaKm2(box(0.5, 0.5, 10));
    expect(km2).toBeGreaterThan(8000);
    expect(km2).toBeLessThan(12000);
  });

  it("狭ければ止めない", () => {
    expect(shouldPauseScan(NATIONWIDE, box(0.05, 0.05, 12))).toBe(false);
  });

  it("広すぎれば止める", () => {
    /* 関東全域くらい（1.5 度四方 ≒ 90,000 km²） */
    expect(shouldPauseScan(NATIONWIDE, box(0.75, 0.75, 8))).toBe(true);
  });

  it("県や半径が選ばれていれば、広くても止めない", () => {
    const wide = box(0.75, 0.75, 8);
    expect(
      shouldPauseScan({ prefecture: "愛知県", radiusKm: "all" }, wide),
    ).toBe(false);
    expect(shouldPauseScan({ prefecture: "all", radiusKm: "50" }, wide)).toBe(
      false,
    );
  });

  it("範囲が未確定なら止めない（初回の検索を潰さない）", () => {
    expect(shouldPauseScan(NATIONWIDE, null)).toBe(false);
  });

  /*
    **旧規則（zoom < 10）との差をここに固定する。**

    ズームは広さの代わりにならない。同じ zoom 9 でも、写っている面積は
    画面の縦横で何倍も違う。下の 2 つは**どちらも zoom 9** だが、
    旧規則ではどちらも止まり、新規則では狭いほうだけ通る。

    旧規則に戻すと「狭いのに止まる」が復活してこの検査が落ちる。
  */
  it("同じズームでも、狭ければ通り広ければ止まる（旧規則では両方止まっていた）", () => {
    const narrowAtZoom9 = box(0.1, 0.1, 9);
    const wideAtZoom9 = box(0.8, 0.8, 9);

    expect(boundsAreaKm2(narrowAtZoom9)).toBeLessThan(MAX_AUTO_SCAN_KM2);
    expect(boundsAreaKm2(wideAtZoom9)).toBeGreaterThan(MAX_AUTO_SCAN_KM2);

    expect(shouldPauseScan(NATIONWIDE, narrowAtZoom9)).toBe(false);
    expect(shouldPauseScan(NATIONWIDE, wideAtZoom9)).toBe(true);

    /* 旧規則をここに写す。zoom だけを見ると両方とも止まっていた */
    const oldRule = (b: { zoom: number }) => b.zoom < 10;
    expect(oldRule(narrowAtZoom9)).toBe(true);
    expect(oldRule(wideAtZoom9)).toBe(true);
  });
});
