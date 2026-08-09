export const DEFAULT_RADIUS_KM = "50";

export const NEARBY_SEARCH_AREA = "nearby";
export const NATIONWIDE_SEARCH_AREA = "nationwide";
export const SEARCH_AREA_STORAGE_KEY = "arb_searchArea";

export interface ArbitrageSearchFilters {
  prefecture: string;
  radiusKm: string;
}

export interface ArbitrageMapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom: number;
}

/**
 * 画面の検索範囲から API の地理条件へ変換する。
 *
 * 「都道府県指定なし」と「全国」はどちらも prefecture=all だが、前者だけ
 * 半径50kmを付ける。同じ select 値にまとめると表示と実際の検索範囲が
 * 食い違うため、画面上は別の値として扱う。
 */
export function filtersForSearchArea(
  searchArea: string,
): ArbitrageSearchFilters {
  if (searchArea === NEARBY_SEARCH_AREA || searchArea === "all") {
    return { prefecture: "all", radiusKm: DEFAULT_RADIUS_KM };
  }
  if (searchArea === NATIONWIDE_SEARCH_AREA) {
    return { prefecture: "all", radiusKm: "all" };
  }
  return { prefecture: searchArea, radiusKm: "all" };
}

/** API の地理条件を、画面の一意な選択値へ戻す。 */
export function searchAreaForFilters(
  prefecture: string,
  radiusKm: string,
): string {
  if (prefecture !== "all") return prefecture;
  return radiusKm === "all" ? NATIONWIDE_SEARCH_AREA : NEARBY_SEARCH_AREA;
}

function isSupportedSearchArea(
  searchArea: string | null,
  validPrefectures: readonly string[],
): searchArea is string {
  return (
    searchArea === NEARBY_SEARCH_AREA ||
    searchArea === NATIONWIDE_SEARCH_AREA ||
    (searchArea !== null && validPrefectures.includes(searchArea))
  );
}

/**
 * 保存済み条件を現在の3形態へ正規化する。
 *
 * 新キーだけが「利用者が全国を明示選択した」ことを表せる。旧 all/all は
 * 旧既定値と区別できないため、近隣50kmへ安全に移行する。
 */
export function normalizeStoredSearchArea(
  storedSearchArea: string | null,
  legacyPrefecture: string,
  validPrefectures: readonly string[],
): string {
  if (isSupportedSearchArea(storedSearchArea, validPrefectures)) {
    return storedSearchArea;
  }
  if (validPrefectures.includes(legacyPrefecture)) {
    return legacyPrefecture;
  }
  return NEARBY_SEARCH_AREA;
}

/** URLの独立した県・半径指定を、画面で表せる検索範囲へ正規化する。 */
export function searchAreaFromUrl(
  prefecture: string | null,
  radiusKm: string | null,
  validPrefectures: readonly string[],
): string | null {
  if (!prefecture) return null;
  if (validPrefectures.includes(prefecture)) return prefecture;
  if (prefecture !== "all") return null;
  return radiusKm === "all" ? NATIONWIDE_SEARCH_AREA : NEARBY_SEARCH_AREA;
}

/**
 * 選択中の検索範囲と地図の表示領域からAPIへ送る地理条件を作る。
 * 地図境界は追加の絞り込みであり、近隣50kmの半径を解除しない。
 */
export function geographyParamsForSearch(
  filters: ArbitrageSearchFilters,
  mapBounds: ArbitrageMapBounds | null,
): Record<string, string> {
  const params: Record<string, string> = {
    prefecture: filters.prefecture,
    radiusKm: filters.radiusKm,
  };

  if (mapBounds && mapBounds.zoom >= 10) {
    params.minLat = mapBounds.minLat.toString();
    params.maxLat = mapBounds.maxLat.toString();
    params.minLon = mapBounds.minLon.toString();
    params.maxLon = mapBounds.maxLon.toString();
  }

  return params;
}
