/**
 * 掲載の分布を升目にまとめる。
 *
 * ## なぜ要るか（利用者の要望、2026-09-04）
 *
 * 「広いズームのときは細かい数よりもっと大きめの数で、その箇所では
 * 集約したい」。市区町村のまま引くと、全国では 1,127 個の丸が出る。
 * 数が細かすぎて読めないうえ、丸だけで画面が埋まる。
 *
 * 升目にまとめると、**引くほど数が大きく・印が少なくなる。**地図の
 * 縮尺と情報の粒度が揃う。
 *
 * ## 置き場所
 *
 * 升目の切り方は緯度経度の等分。**面積は正確ではない**（緯度が上がる
 * ほど経度 1 度は短い）が、ここは分布の濃淡を見るためのもので、面積
 * あたりの密度を出しているわけではない。等分で足りる。
 *
 * 印を置く位置は**件数で重み付けした平均**。単純な升目の中心に置くと、
 * 升の隅に街が寄っているとき、海の上に丸が出る。
 */

import type { MunicipalityListing } from "@/utils/areaDatasetMerge";

export interface ListingCell {
  /** 升目の鍵。緯度と経度の升の番号から作る。 */
  key: string;
  /** 件数で重み付けした位置。 */
  lat: number;
  lon: number;
  /** 升目に入った掲載の合計。 */
  count: number;
  /** 升目に入った市区町村の数。 */
  areas: number;
}

/**
 * ズームから升目の大きさ（度）を引く。
 *
 * 引くほど粗くする。**0 を返さない。**0 で割ると鍵が壊れる。
 *
 * 数字は「画面に出る印がおおむね 40〜150 個に収まる」ところを見て
 * 決めた。日本の陸地はおよそ緯度 20 度・経度 30 度の幅にあるので、
 * 全国を映す zoom 5 で 2 度なら 10 × 15 の升目になる。
 */
export function cellDegreesForZoom(zoom: number): number {
  if (zoom <= 6) return 2;
  if (zoom <= 7) return 1;
  return 0.5;
}

/**
 * 市区町村の一覧を升目にまとめる。
 *
 * 掲載が 0 の市区町村は落とす。丸を出しても何も言っていない。
 */
export function aggregateToGrid(
  listings: readonly MunicipalityListing[],
  cellDeg: number,
): ListingCell[] {
  if (!(cellDeg > 0)) return [];
  const cells = new Map<
    string,
    { latSum: number; lonSum: number; count: number; areas: number }
  >();

  for (const m of listings) {
    if (m.count <= 0) continue;
    const latIdx = Math.floor(m.lat / cellDeg);
    const lonIdx = Math.floor(m.lon / cellDeg);
    const key = `${latIdx}:${lonIdx}`;
    const cur = cells.get(key) ?? { latSum: 0, lonSum: 0, count: 0, areas: 0 };
    /* 件数で重み付けする。単純な平均だと、掲載 3 件の村と 2 万件の市が
       同じ重みになり、印が街から離れる */
    cur.latSum += m.lat * m.count;
    cur.lonSum += m.lon * m.count;
    cur.count += m.count;
    cur.areas += 1;
    cells.set(key, cur);
  }

  return [...cells.entries()].map(([key, c]) => ({
    key,
    lat: c.latSum / c.count,
    lon: c.lonSum / c.count,
    count: c.count,
    areas: c.areas,
  }));
}
