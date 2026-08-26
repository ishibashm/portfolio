/**
 * 地図のピンをタイルの升目でまとめる。
 *
 * ## なぜ要るか
 *
 * `ArbitrageMapInner` にはまとめる仕組みが 2 通りあるが、**zoom 12〜14 で
 * 表示件数が 100 を超えると、どちらにも入らない穴が空いている。**
 *
 *     showHeatmap && 件数 > 100        → 市区町村バブル
 *     件数 <= 100 && zoom < 15         → 距離クラスター
 *     それ以外                          → 個別のピン ← 上限なし
 *
 * しかも `zoom >= 12` では `showHeatmap` が強制的に false になるので、
 * 都市部を zoom 12〜14 で見ると**表示域の全物件が個別に描かれる。**
 *
 * ## 距離で寄せると件数の 2 乗になる
 *
 * 既存の距離クラスターは「点ごとに既存グループを全部見る」形で、
 * 計算量が O(n²)。100 件までを前提にした実装なので、そのまま件数を
 * 増やすと今度は計算で詰まる。
 *
 * ここでは**升目に落として数える。**点ごとに升目の番号を 1 回計算して
 * Map に入れるだけなので O(n)。数千件でも 1 回の走査で終わる。
 *
 * ## 升目はタイルで取る
 *
 * 画面のズームに `CLUSTER_SUBDIVISION` を足したズームのタイル番号を
 * 升目の鍵にする。タイルは 256px なので、+3 なら 1 升 32px 相当。
 * **ズームが上がれば升目も細かくなる**ので、拡大するほど分かれていく。
 *
 * 緯度経度から升目を出す計算は `lib/tileCoords` に寄せてある。
 */

import { latToTileY, lonToTileX } from "@/lib/tileCoords";

/** 画面のズームに足すぶん。1 升 ＝ 256 / 2**3 ＝ 32px 相当。 */
export const CLUSTER_SUBDIVISION = 3;

/**
 * まとめ始める件数。これ以下なら 1 つずつ描く。
 *
 * 少ないうちは個別のピンのほうが読みやすい。**まとめるのは「多すぎて
 * 描けない」を避けるため**であって、少ない画面まで数字の玉にすると
 * 押す手間が増えるだけになる。
 */
export const CLUSTER_THRESHOLD = 150;

export interface HasCoords {
  lat: number | null;
  lon: number | null;
}

export interface Cluster<T> {
  /** 升目に入った点の重心。 */
  lat: number;
  lon: number;
  count: number;
  items: T[];
}

/**
 * 升目ごとにまとめる。**並び順は入力の順**（同じ入力なら同じ結果）。
 *
 * 座標の無い点は落とす。地図に置き場所が無いので、数えると
 * 「見えている数」と合わなくなる。
 */
export function clusterByTile<T extends HasCoords>(
  items: readonly T[],
  zoom: number,
  subdivision: number = CLUSTER_SUBDIVISION,
): Cluster<T>[] {
  const gridZoom = Math.max(0, Math.floor(zoom) + subdivision);
  const buckets = new Map<string, Cluster<T>>();

  for (const item of items) {
    const { lat, lon } = item;
    if (lat === null || lon === null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const key = `${lonToTileX(lon, gridZoom)}/${latToTileY(lat, gridZoom)}`;
    const found = buckets.get(key);
    if (found) {
      found.items.push(item);
      found.count++;
      // 重心は最後にまとめて出す。ここで割ると桁落ちが積もる。
      found.lat += lat;
      found.lon += lon;
    } else {
      buckets.set(key, { lat, lon, count: 1, items: [item] });
    }
  }

  const out: Cluster<T>[] = [];
  for (const b of buckets.values()) {
    out.push({ ...b, lat: b.lat / b.count, lon: b.lon / b.count });
  }
  return out;
}

/**
 * まとめるべきかどうか。
 *
 * **件数だけで決める。**ズームで決めると「拡大したら急に数千個」が
 * 戻ってくる（いまの穴がまさにそれ）。
 */
export function shouldCluster(
  count: number,
  threshold: number = CLUSTER_THRESHOLD,
): boolean {
  return count > threshold;
}
