/**
 * 「隠れている地図」から読んだ値を使わないための番人。
 *
 * 発端: スマホで「地図」から「一覧・条件」へ切り替えると件数が 0 になる、
 * という利用者報告（地図では 303 件、一覧では 0 件。同じ画面の
 * 「方位ごとの内訳」は 303 件のままで、数が食い違っていた）。
 *
 * 起きていたこと:
 *
 *   1. 一覧に切り替えると、地図の器が `display:none` になる（スマホのみ）
 *   2. InvalidateMapSize の ResizeObserver がそれを 0×0 の寸法変化として拾う
 *   3. map.invalidateSize() が走る。Leaflet はこのとき寸法が変わっていれば
 *      **moveend を発火する**（leaflet-src.js の invalidateSize）
 *   4. BoundsListener が moveend で map.getBounds() を読む。0×0 の地図の
 *      範囲は**一点に潰れている**
 *   5. その潰れた範囲が絞り込みに使われ、範囲内の件数が 0 になる
 *
 * 「地図」に戻すと直っていたのは、戻すボタンが window の resize を流して
 * 測り直させていたため。つまり**出ていく側だけ**が無防備だった。
 *
 * 直し方は「数字を読む前に、その地図に本当に大きさがあるか確かめる」。
 * 隠れているあいだは読まない。見えたときに測り直されて正しい値が入る。
 */

/** 画面に箱を持っているか。`display:none` の要素は 0×0 になる。 */
export function hasRenderedBox(
  size: { x: number; y: number } | null | undefined,
): boolean {
  if (!size) return false;
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) return false;
  return size.x > 0 && size.y > 0;
}

export type MapViewport = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom: number;
};

/** readMapViewport が必要とする分だけの Leaflet の地図。 */
type MeasurableMap = {
  getSize: () => { x: number; y: number };
  getBounds: () => {
    getSouthWest: () => { lat: number; lng: number };
    getNorthEast: () => { lat: number; lng: number };
  };
  getZoom: () => number;
};

/**
 * 表示範囲を読む。**隠れている地図では null を返す。**
 * null は「今は測れない」の意味で、「範囲が無い」ではない。
 * 受け取る側は前の値を保つこと（0 件に潰さない）。
 */
export function readMapViewport(map: MeasurableMap): MapViewport | null {
  if (!hasRenderedBox(map.getSize())) return null;
  const bounds = map.getBounds();
  return {
    minLat: bounds.getSouthWest().lat,
    maxLat: bounds.getNorthEast().lat,
    minLon: bounds.getSouthWest().lng,
    maxLon: bounds.getNorthEast().lng,
    zoom: map.getZoom(),
  };
}
