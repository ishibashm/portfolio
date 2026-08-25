/**
 * 地図の**下地**（ベースマップ）の一覧。
 *
 * これまで下地は CARTO の 1 種類だけで、明暗を切り替えるしかなかった。
 * 引越し先を選ぶうえでは「そこがどういう土地か」——坂か、平地か、
 * 周りに何があるか——が効くので、地形と写真を足す。
 *
 * 出どころは**地理院タイル**（国土地理院）。鍵も課金も要らず、
 * 出典を出せば商用でも使える。`lib/hazardLayers.ts` の重ね描きと同じで、
 * **サーバも DB も介さない。**ブラウザが表示域のぶんだけ取りに行く。
 *
 * ## ズームの上限が種類ごとに違う
 *
 * ハザードのタイルと同じで、**配信の無いズームは 404 になり、Leaflet は
 * それを静かに透明として扱う。**下地が透明になると画面が真っ白になり、
 * 「壊れた」ようにしか見えない。
 *
 * 種類ごとの配信上限を `maxNativeZoom` に渡すと、Leaflet は上限の
 * タイルを引き伸ばして描く。粗くはなるが白くはならない。**新しい下地を
 * 足すときは上限を必ず調べて書くこと。**
 *
 * ## 判定には使わない
 *
 * ここにあるのは**表示だけ。**吉凶の判定に地形は入れていない。
 * 入れるなら CLAUDE.md 3 節の手順（旧挙動をテストに固定してから）。
 */

export type BaseMapId = "carto" | "pale" | "photo" | "relief";

export interface BaseMapDef {
  /** 画面のボタンに出す名前。 */
  label: string;
  /** タイルの配信元。{z}/{x}/{y} は Leaflet が埋める。 */
  url: string;
  /** 出典表示。地理院タイルの利用規約で出典の明示が要る。 */
  attribution: string;
  /**
   * 配信されている最大ズーム。これを超えると 404 になるので、
   * Leaflet の `maxNativeZoom` に渡して引き伸ばして描く。
   */
  maxNativeZoom: number;
  /** 地図として拡大できる上限。下地が粗くてもピンは動かしたい。 */
  maxZoom: number;
  /** 一言の説明。何のための下地かを画面で伝える。 */
  note: string;
}

const GSI = "https://cyberjapandata.gsi.go.jp/xyz";

/** 地理院タイルの出典。規約で明示が要る。 */
export const GSI_ATTRIBUTION =
  '出典: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>（国土地理院）';

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors';

/**
 * 選べる下地。**既定は carto**（従来と同じ）。
 *
 * 下地を替えても物件の絞り込みも判定も変わらない。見え方だけ。
 */
export const BASE_MAPS: Record<BaseMapId, BaseMapDef> = {
  carto: {
    label: "標準",
    // 明暗は呼び出し側が差し替える。ここは明るいほうを既定に置く。
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: CARTO_ATTRIBUTION,
    maxNativeZoom: 19,
    maxZoom: 20,
    note: "道路と地名が読みやすい既定の地図",
  },
  pale: {
    label: "淡色",
    url: `${GSI}/pale/{z}/{x}/{y}.png`,
    attribution: GSI_ATTRIBUTION,
    maxNativeZoom: 18,
    maxZoom: 20,
    note: "色を抑えた地図。ピンや重ね描きが見やすい",
  },
  photo: {
    label: "空中写真",
    url: `${GSI}/seamlessphoto/{z}/{x}/{y}.jpg`,
    attribution: GSI_ATTRIBUTION,
    maxNativeZoom: 18,
    maxZoom: 20,
    note: "周りに何があるかを実際の写真で見る",
  },
  relief: {
    label: "地形",
    url: `${GSI}/relief/{z}/{x}/{y}.png`,
    attribution: GSI_ATTRIBUTION,
    // 色別標高図は z15 まで。ここを 18 と書くと拡大した瞬間に白くなる。
    maxNativeZoom: 15,
    maxZoom: 20,
    note: "標高を色で塗り分けた図。坂と低地が分かる",
  },
};

/** 画面に並べる順。既定を先頭に置く。 */
export const BASE_MAP_ORDER: readonly BaseMapId[] = [
  "carto",
  "pale",
  "photo",
  "relief",
];

/**
 * 陰影起伏図。**下地ではなく重ね描き。**
 *
 * 単体だと道路も地名も無いので下地にはできない。淡色や空中写真の上に
 * 薄く重ねると、平面の地図でも尾根と谷が読めるようになる。
 */
export const HILLSHADE: BaseMapDef = {
  label: "陰影",
  url: `${GSI}/hillshademap/{z}/{x}/{y}.png`,
  attribution: GSI_ATTRIBUTION,
  // 陰影起伏図は z16 まで。
  maxNativeZoom: 16,
  maxZoom: 20,
  note: "尾根と谷の起伏を陰影で重ねる",
};

/**
 * 保存された文字列を下地の種類に直す。知らない値は既定へ倒す。
 *
 * `value in BASE_MAPS` で書くと **`"toString"` や `"constructor"` が
 * 通ってしまう**（Object.prototype をたどるため）。localStorage の値は
 * 利用者が書き換えられるので、自分の持ち物だけを見る。
 */
export function parseBaseMapId(value: string | null | undefined): BaseMapId {
  if (value && Object.prototype.hasOwnProperty.call(BASE_MAPS, value)) {
    return value as BaseMapId;
  }
  return "carto";
}
