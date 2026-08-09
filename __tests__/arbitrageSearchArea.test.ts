import { describe, expect, it } from "vitest";
import {
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

  it("migrates ambiguous legacy all/all storage to nearby", () => {
    expect(normalizeStoredSearchArea(null, "all", ["兵庫県", "愛知県"])).toBe(
      NEARBY_SEARCH_AREA,
    );
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
