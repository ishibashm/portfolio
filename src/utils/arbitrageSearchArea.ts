export const DEFAULT_RADIUS_KM = "50";

export const NEARBY_SEARCH_AREA = "nearby";
export const NATIONWIDE_SEARCH_AREA = "nationwide";
export const SEARCH_AREA_STORAGE_KEY = "arb_searchArea";

/**
 * 何も選んでいない状態の検索範囲。
 *
 * 一度は近隣50kmを既定にした。全国のまま初回検索に入ると45万行の名寄せに
 * なり18.4秒かかっていたためだが、これは範囲を狭めて速くしただけで、
 * 利用者からは「50km 圏外の物件が最初から存在しないように見える」。
 * 方位を見て引越し先を探す道具でそれは筋が悪い。
 *
 * 既定は上限なしに戻す。速さは地図の表示範囲で担保する。ズーム10以上では
 * 表示中の矩形が絞り込みとして送られるので、見えている範囲だけを検索する。
 * 「隠れた条件で削る」のではなく「見えているものを検索する」形にした。
 */
export const DEFAULT_SEARCH_AREA = NATIONWIDE_SEARCH_AREA;

/**
 * 出発地を中心に最初に表示する範囲の半幅（度）。
 *
 * 地図は moveend / zoomend でしか表示範囲を報告しないため、初回の検索だけは
 * 範囲が未確定のまま走る。そこだけ全国スキャンになるのを避けるため、
 * 出発地の周りの矩形を先に置いておく。緯度0.35度はおよそ39km、
 * 経度0.45度は日本の緯度でおよそ40km。地図の初期ズームと揃えてある。
 */
export const INITIAL_VIEW_LAT_SPAN = 0.35;
export const INITIAL_VIEW_LON_SPAN = 0.45;
/** 上の矩形に対応する地図のズーム。10以上でないと矩形が絞り込みに使われない */
export const INITIAL_VIEW_ZOOM = 11;

/** 全国を俯瞰するときの地図の中心とズーム。ここでは県別の色分けを見せる */
export const OVERVIEW_CENTER: [number, number] = [36.2048, 138.2529];
export const OVERVIEW_ZOOM = 5;

/** 出発地の周りに、初回検索ぶんの表示範囲を作る */
export function initialViewBounds(
  baseLat: number,
  baseLon: number,
): ArbitrageMapBounds {
  return {
    minLat: baseLat - INITIAL_VIEW_LAT_SPAN,
    maxLat: baseLat + INITIAL_VIEW_LAT_SPAN,
    minLon: baseLon - INITIAL_VIEW_LON_SPAN,
    maxLon: baseLon + INITIAL_VIEW_LON_SPAN,
    zoom: INITIAL_VIEW_ZOOM,
  };
}

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
 * 県が保存されていればそれを使う。それ以外は既定へ倒す。旧 all/all を
 * 近隣50kmへ移行していたが、既定が上限なしに戻ったので区別する意味が無い。
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
  return DEFAULT_SEARCH_AREA;
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
