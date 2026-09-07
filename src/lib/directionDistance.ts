/**
 * 近すぎる移動では方位が定まらない、という事実の置き場。
 *
 * 方位は出発地から見た向きで決まるので、距離が短いほど「実際にどう動いたか」
 * より「地図のピンをどこに置いたか」で決まってしまう。方位が隣の区分に
 * 変わるのに必要な横ずれを距離ごとに出すと、こうなる（判定の既定である
 * 伝統区分＝四正 30 度の半幅 15 度で計算。四隅は 60 度なので、いちばん
 * 狭い区分の値を出す）。
 *
 *   0.5 km …   134 m      2 km …   536 m     30 km …  8.0 km
 *     1 km …   268 m      5 km …  1340 m     50 km … 13.4 km
 *
 * 以前は 45 度等分（半幅 22.5 度）で計算していて 1 km で 414 m と出して
 * いたが、判定は既定で伝統区分を使うので、四正では 268 m ずれただけで
 * 隣に変わる。画面に出す数字が判定より 1.5 倍ゆるかった。半幅は
 * utils/directionGeo の directionWedgeHalfWidth から引き、区切りの定義を
 * ここに写さない。
 *
 * 住所のジオコーディングは町丁目までで、誤差は数百 m ある。つまり
 * 1〜2 km 以下では、誤差のほうが方位を決めてしまう。
 *
 * この数字（5 km）は新しく決めたものではない。lib/areaContent が
 * 「近すぎる相手は方位が定まらないので除く。同一市内の区など。」として
 * 既に使っていた閾値で、上の計算とも整合する。2 か所に書かないよう、
 * 定義をここへ集める。
 *
 * **判定は変えない。**この距離でも方位盤の判定はこれまでどおり出す。
 * 「その判定がどれだけ当てになるか」を画面に添えるためだけに使う。
 * 距離で吉凶の強弱を変えるかどうかは流派で言うことが違うので、
 * 決まるまで実装しない（docs/improvement-backlog.md の E）。
 */

import { directionWedgeHalfWidth } from "@/utils/directionGeo";

/** これ未満の移動では、方位はピンの置き方で変わりうる。 */
export const DIRECTION_UNSTABLE_KM = 5;

/** 方位が定まらないほど近いか。 */
export function isDirectionUnstable(distanceKm: number): boolean {
  return Number.isFinite(distanceKm) && distanceKm < DIRECTION_UNSTABLE_KM;
}

/**
 * その距離で、方位が隣の区分に変わるのに必要な横ずれ（メートル）。
 * 「どれくらい当てにならないか」を具体的な長さで言うために使う。
 *
 * 区分の中心から測った値。いちばん狭い区分（伝統区分では四正の 30 度）で
 * 出す。広い四隅の値を出すと、四正にいる利用者には甘い数字になる。
 */
export function sectorShiftMeters(
  distanceKm: number,
  nodeMapping: "traditional" | "physical" = "traditional",
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const halfWidthDeg = directionWedgeHalfWidth("N", nodeMapping);
  return Math.round(
    distanceKm * Math.tan((halfWidthDeg * Math.PI) / 180) * 1000,
  );
}

/** 画面にそのまま出す一文。null なら添える必要がない距離。 */
export function directionUnstableNote(
  distanceKm: number,
  nodeMapping: "traditional" | "physical" = "traditional",
): string | null {
  if (!isDirectionUnstable(distanceKm)) return null;
  const shift = sectorShiftMeters(distanceKm, nodeMapping);
  return `この距離（約${distanceKm.toFixed(1)}km）では方位が定まりません。${shift}m ずれるだけで方位が隣に変わります。`;
}

/*
 * 距離そのものの計算は utils/directionGeo.distanceKmBetween を使う。
 * ここで同じ式を書き直していたのを消した。CLAUDE.md が名指ししている
 * 「寄せ先が既にあるか先に探す」を、自分で踏んだ。
 */
