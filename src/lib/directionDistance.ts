/**
 * 近すぎる移動では方位が定まらない、という事実の置き場。
 *
 * 方位は出発地から見た向きで決まるので、距離が短いほど「実際にどう動いたか」
 * より「地図のピンをどこに置いたか」で決まってしまう。方位が隣の区分に
 * 変わるのに必要な横ずれを距離ごとに出すと、こうなる（八方位＝45 度等分、
 * 半区分 22.5 度で計算）。
 *
 *   0.5 km …   207 m      2 km …   828 m     30 km … 12.4 km
 *     1 km …   414 m      5 km …  2071 m     50 km … 20.7 km
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

/** これ未満の移動では、方位はピンの置き方で変わりうる。 */
export const DIRECTION_UNSTABLE_KM = 5;

/** 方位が定まらないほど近いか。 */
export function isDirectionUnstable(distanceKm: number): boolean {
  return Number.isFinite(distanceKm) && distanceKm < DIRECTION_UNSTABLE_KM;
}

/**
 * その距離で、方位が隣の区分に変わるのに必要な横ずれ（メートル）。
 * 「どれくらい当てにならないか」を具体的な長さで言うために使う。
 */
export function sectorShiftMeters(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.round(distanceKm * Math.tan((22.5 * Math.PI) / 180) * 1000);
}

/** 画面にそのまま出す一文。null なら添える必要がない距離。 */
export function directionUnstableNote(distanceKm: number): string | null {
  if (!isDirectionUnstable(distanceKm)) return null;
  const shift = sectorShiftMeters(distanceKm);
  return `この距離（約${distanceKm.toFixed(1)}km）では方位が定まりません。${shift}m ずれるだけで方位が隣に変わります。`;
}

/*
 * 距離そのものの計算は utils/directionGeo.distanceKmBetween を使う。
 * ここで同じ式を書き直していたのを消した。CLAUDE.md が名指ししている
 * 「寄せ先が既にあるか先に探す」を、自分で踏んだ。
 */
