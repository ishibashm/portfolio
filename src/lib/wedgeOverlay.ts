/**
 * 方位の扇形を「塗るか、境界線だけにするか」。
 *
 * ## なぜ 1 か所に置くか（2026-09-05）
 *
 * 扇形は八方位を色で示す。その下に**別の意味の色**があると、2 枚が
 * 混ざってどちらも読めなくなる（#147 で実際に起きた取り違え）。だから
 * 「下に色があるときは塗らず、境界線とラベルだけ残す」という規則が
 * `ArbitrageMapInner` にあった。
 *
 *     const outlineOnly = isOverview || showHeatmap;
 *
 * **ところが後から足した層が入っていなかった。**用途地域は 13 色の
 * 塗り分け、ハザードは浸水深の色で、どちらも扇形と同じくらい強い。
 * 用途地域を出すと扇形の 8 色と重なり、**この規則が防ぐはずだった
 * 状態がそのまま起きていた。**
 *
 * 利用者の要望「扇形を出したまま重ねられるようにしたい」は、これ。
 * 消すか出すかの二択ではなく、**下に色があるときは薄くする**のが答え。
 *
 * 層を足すたびに条件式へ 1 つ足す形だと、また忘れる。**意味のある色を
 * 敷く層はここに集める。**
 *
 * 掲載件数のバブル（showHeatmap）は 2026-09-20 に物件の描画ごと外した。
 */

/** 扇形の下に敷かれている、意味のある色。 */
export interface WedgeUnderlay {
  /**
   * 俯瞰の県の塗り分け（方位の吉凶）が敷かれているか。名前は歴史的な
   * もので、**県を色で塗っているときだけ** true を渡す（`prefFillOn`）。
   * 扇形で塗る見方（既定）では県は輪郭だけなので false。
   */
  isOverview: boolean;
  /** 用途地域（13 色の塗り分け）。 */
  zoningOn: boolean;
  /** ハザード（浸水深などの色）。"none" 以外なら敷かれている。 */
  hazardOn: boolean;
}

/**
 * 境界線だけにするか。
 *
 * true なら塗らない（`fillOpacity: 0`）。**扇形自体は消さない。**
 * どこからどこまでが東かは境界線とラベルで分かる。
 */
export function wedgeOutlineOnly(u: WedgeUnderlay): boolean {
  return u.isOverview || u.zoningOn || u.hazardOn;
}

/**
 * 俯瞰（全国）で何を塗るか（利用者の指摘、2026-09-24）。
 *
 *     どの県へ動けるかの地図は方角が描画されていないですが、都道府県が
 *     赤くなるか緑になるかだと、その方位の枠内でも赤になるのでは？
 *     純粋に枠内を色塗れない？
 *
 * 県の塗り分けは、県の**中心 1 点**の方位で県全体を 1 色にしていた
 * （lib/prefectureDirection）。兵庫・長野・北海道のように広い県は境目を
 * またぐので、吉方位の扇形の中にある土地まで凶の色で塗られる。
 *
 *   "wedge" … 扇形そのものを塗る。**扇形の中は全部同じ方位**なので、
 *             県境と関係なく正しい。県は輪郭だけ（既定）
 *   "pref"  … 県ごとに 1 色（今までの見え方）。県単位で見たいとき用の目安
 */
export type OverviewPaint = "wedge" | "pref";

export const OVERVIEW_PAINT_KEY = "arb_overview_paint";

/** 保存値を読む。知らない値・未保存は正確なほう（扇形）。 */
export function parseOverviewPaint(raw: unknown): OverviewPaint {
  return raw === "pref" ? "pref" : "wedge";
}

/** 俯瞰で県を色で塗るか（塗らないときは輪郭だけ）。 */
export function prefFillOn(isOverview: boolean, paint: OverviewPaint): boolean {
  return isOverview && paint === "pref";
}

/**
 * 俯瞰で扇形を塗るときの濃さ。近景の濃さ（TIER_SECTOR_OPACITY）は下の
 * 地名や道を読ませるための薄さで、全国に引くと色が見分けにくい。
 * 県の塗り（0.5）より薄く抑え、下の地図は透けて見える程度にする。
 */
export function overviewWedgeOpacity(baseOpacity: number): number {
  return Math.min(0.45, baseOpacity * 2.5);
}
