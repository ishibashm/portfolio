import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_AREA,
  initialViewBounds,
  NEARBY_SEARCH_AREA,
  NATIONWIDE_SEARCH_AREA,
  filtersForSearchArea,
  geographyParamsForSearch,
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
