/**
 * ハザードマップのタイル一覧。
 *
 * 国土交通省「重ねるハザードマップ」（disaportal.gsi.go.jp）が配信する
 * XYZ タイルを、地図の上に重ねて描く。**サーバも DB も介さない。**
 * タイルはブラウザが表示域のぶんだけ遅延で取りに行くので、物件の
 * 探索・表示の速さには効かない（地図の下地の CARTO タイルと同じ仕組み）。
 *
 * ## 区域が無い場所は「透明」で返る
 *
 * 指定区域の外はタイルそのものが無く 404 になる。Leaflet はそれを
 * 静かに透明として扱うので、**「何も出ない」は「区域外」か「配信側の
 * 変更」かを画面からは区別できない。**配信 URL が変わった疑いが出たら
 * https://disaportal.gsi.go.jp/ の「重ねるハザードマップ」で同じ場所を
 * 開いて見比べること。
 *
 * ## 判定には使わない
 *
 * ここにあるのは**表示だけ。**吉凶の判定にハザードは入れていない。
 * 入れるなら CLAUDE.md 3 節の手順（旧挙動をテストに固定してから）。
 */

export interface HazardLayerDef {
  /** タイルの配信元。{z}/{x}/{y} は Leaflet が埋める。 */
  url: string;
  /** 出典表示。国交省の利用規約で出典の明示が要る。 */
  attribution: string;
}

export type HazardTabId =
  | "none"
  | "flood"
  | "sediment"
  | "tsunami"
  | "hightide";

const BASE = "https://disaportaldata.gsi.go.jp/raster";
const ATTR =
  '出典: <a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer">ハザードマップポータルサイト</a>（国土交通省）';

/**
 * タブごとのタイル。土砂は「土石流・急傾斜地・地すべり」の 3 区域が
 * 別々のタイルで配信されているので、1 つのタブで 3 枚重ねる。
 */
export const HAZARD_TABS: Record<
  Exclude<HazardTabId, "none">,
  { label: string; layers: HazardLayerDef[] }
> = {
  flood: {
    label: "洪水",
    layers: [
      {
        // 洪水浸水想定区域（想定最大規模）
        url: `${BASE}/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
    ],
  },
  sediment: {
    label: "土砂",
    layers: [
      {
        url: `${BASE}/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
      {
        url: `${BASE}/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
      {
        url: `${BASE}/05_jisuberikeikaikuiki/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
    ],
  },
  tsunami: {
    label: "津波",
    layers: [
      {
        url: `${BASE}/04_tsunami_newlegend_data/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
    ],
  },
  hightide: {
    label: "高潮",
    layers: [
      {
        url: `${BASE}/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png`,
        attribution: ATTR,
      },
    ],
  },
};

/** 配信側の上限。これより寄ったら手前の絵を引き伸ばす。 */
export const HAZARD_MAX_NATIVE_ZOOM = 17;

/**
 * 下の地図が透けて場所が分かる濃さ。1.0 にすると下地が消えて
 * どこの話か分からなくなる。
 */
export const HAZARD_OPACITY = 0.65;

/** localStorage の鍵。地図をまたいで同じ選択を引き継ぐ。 */
export const HAZARD_STORAGE_KEY = "map_hazard_tab_v1";

export function normalizeHazardTab(value: unknown): HazardTabId {
  return value === "flood" ||
    value === "sediment" ||
    value === "tsunami" ||
    value === "hightide"
    ? value
    : "none";
}
