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

  /*
    **ズームに関わらず送る。**以前は `zoom >= 10` のときだけ付けていたが、
    それが「俯瞰では物件が出ない」の原因そのものだった。

    俯瞰（zoom < 10）でも表示範囲は**有界**で、zoom 8 なら関東くらいの
    広さしかない。それなのに範囲を送らないので、API から見ると
    prefecture=all・radiusKm=all・範囲なし＝**全国 45 万行**の要求になる。
    重すぎるから画面側は要求そのものを打ち切る（scanPaused）——という
    循環になっていた。**重いのは俯瞰だからではなく、範囲を捨てていたから。**

    実害は打ち切りだけではない。「それでも検索する」（force）を押した
    ときも範囲が付かないので、

      - 実測 18.4 秒かかる（全国の名寄せ）
      - 出てくるのは**画面に写っていない全国の物件**

    という二重の外れ方をしていた。利用者の報告「いいところまで地図
    表示していない／物件一覧に出てこない」はこれ。範囲を送れば、
    一覧は**見えている範囲と一致する**。

    範囲を足して重くなることはない。WHERE が狭くなるだけで、
    候補の切り出し（DISTINCT ON + 窓関数）が読む行数は必ず減る。
  */
  if (mapBounds) {
    params.minLat = mapBounds.minLat.toString();
    params.maxLat = mapBounds.maxLat.toString();
    params.minLon = mapBounds.minLon.toString();
    params.maxLon = mapBounds.maxLon.toString();
  }

  return params;
}

/**
 * 自動で走査してよい表示範囲の広さ（km²）。
 *
 * ## なぜズームでなく面積か（2026-09-10）
 *
 * 打ち切りの条件は長く `zoom < 10` だった。**ズームは広さの代わりに
 * ならない。**同じ zoom 8 でも、縦長の画面と横長の画面、スマホと
 * デスクトップで写る範囲は何倍も違う。重さを決めるのは**写っている
 * 面積（＝走査する行数）**であって、倍率ではない。
 *
 * ズームで切っていたせいで、俯瞰から拡大すると zoom 10 を越えるまで
 * 「0 件」に見えていた（利用者の報告）。**地方ブロックくらいの広さは
 * 実際には走査できる。**
 *
 * ## 10,000 km² の根拠（db-explain の実測、2026-09-10）
 *
 *     名古屋・半径 50km・愛知県   126,800 行   候補の取り出し 880 ms
 *
 * 半径 50km は 100km × 100km ＝ 約 10,000 km²。**その広さが実際に
 * 880ms で返っている**ので、ここを上限に置く。
 *
 * いまの `zoom < 10` はおおむね 600 km² 相当なので、**16 倍まで広げる**
 * ことになる。zoom 8〜9（都市とその周辺、小さい県ひとつ）が押さずに
 * 出るようになる。
 *
 * これより広いときは今までどおり止めて、「それでも検索する」を出す。
 * 関東全域（実測で 56 万行）のような範囲は、押した人だけが待つ。
 */
export const MAX_AUTO_SCAN_KM2 = 10000;

/**
 * 表示範囲のおおよその面積（km²）。
 *
 * 緯度 1 度は約 111km。経度 1 度は緯度で縮むので `cos` を掛ける。
 * **正確な測地面積は要らない**——「走査してよい広さか」を決めるための
 * 桁が合っていればよい。
 */
export function boundsAreaKm2(bounds: ArbitrageMapBounds): number {
  const latKm = (bounds.maxLat - bounds.minLat) * 111;
  const midLat = ((bounds.maxLat + bounds.minLat) / 2) * (Math.PI / 180);
  const lonKm = (bounds.maxLon - bounds.minLon) * 111 * Math.cos(midLat);
  return Math.abs(latKm * lonKm);
}

/**
 * その表示範囲を、押さずに走査してよいか。
 *
 * 県や半径が選ばれていれば母数がそちらで絞られるので、広さに関わらず
 * 走査してよい。止めるのは**県も半径も未指定で、かつ範囲が広すぎる**
 * ときだけ。
 */
export function shouldPauseScan(
  filters: ArbitrageSearchFilters,
  mapBounds: ArbitrageMapBounds | null,
): boolean {
  if (filters.prefecture !== "all") return false;
  if (filters.radiusKm !== "all") return false;
  if (mapBounds === null) return false;
  return boundsAreaKm2(mapBounds) > MAX_AUTO_SCAN_KM2;
}

/**
 * 自動で走査してよい**行数**の上限。
 *
 * ## なぜ面積の上に行数の上限が要るか（本番の実測、2026-09-11）
 *
 * 上の面積の規則は「県や半径が選ばれていれば母数がそちらで絞られる」と
 * して、半径 50km を通していた。**都心では半径 50km が表の 4 分の 3 に
 * 当たる。**scan-timings.yml で直近 48 時間・88 回を集めた結果:
 *
 *     DB の所要   中央値 2,339ms   9 割点 25,494ms   最大 40,641ms
 *     遅い順      radius=50 で total=334,118〜358,864 行 → 25〜34 秒
 *                 radius=all（bbox のみ）で 305,200〜316,369 行 → 39〜41 秒
 *     上限 500 に当たった回数   75 / 88
 *
 * 行数と時間の対応（同じ 48 時間の実測）:
 *
 *     25,582 行（中央値）  →  2.3 秒
 *     49,742 〜 53,133 行  → 11.5〜14.1 秒
 *     127,584 行           → 17.1 秒
 *     305,200 行以上       → 25〜41 秒
 *
 * db-explain の 1 点測定（126,800 行 → 880ms）は本番の 20 分の 1 で、
 * **本番の目安にならない**（走査中の夜間の書き込み・小さいインスタンス・
 * 冷えたキャッシュのどれかで、切り分けはしていない）。
 *
 * 面積や半径は行数の代わりにならない。**行数そのものを、切り出しの前に
 * 数えて決める。**同じ WHERE の COUNT は索引の範囲引きで軽く、
 * 走査の応答に元から入っている（metadata.totalCount）。
 *
 * 10 万行は「17 秒の側を止め、2 秒の側を通す」境目として置いた。
 * 実測の表が更新されたら見直す。**小さくするほど「遅い」が「出ない」に
 * 変わる**ので、利用者の判断（#1159 と同じ「それでも検索する」の口が
 * 残っている）。
 */
export const SCAN_ROW_LIMIT = 100000;

/**
 * 候補の切り出しを走らせてよいか。行数が上限を超えていれば止める。
 * `force` は「それでもこの範囲で検索する」を押したとき。待つと決めたのは
 * 本人なので通す。
 */
export function shouldPauseForRows(totalRows: number, force: boolean): boolean {
  if (force) return false;
  if (!Number.isFinite(totalRows)) return false;
  return totalRows > SCAN_ROW_LIMIT;
}
