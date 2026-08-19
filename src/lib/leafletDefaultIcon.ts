import L from "leaflet";

/**
 * Leaflet の既定マーカーの画像を差し替える下ごしらえ。
 *
 * Leaflet は内部の `_getIconUrl` で画像の場所を組み立てる。バンドラを
 * 通すと組み立て先が実在しなくなり、マーカーが 404 で消える。**先に
 * `_getIconUrl` を外してから** `L.Icon.Default.mergeOptions` で URL を
 * 直接指定する、というのが定番の回避策。
 *
 * ## なぜ関数に切り出したか
 *
 * この 1 行が**地図の部品 5 つに同じ形で書かれていた**（`ArbitrageMapInner`
 * `MagneticMapInner` `LocationPickerInner` `nba/SimulatorMap`
 * `nba/PastMoveMap`）。しかも全部 `as any` でキャストしていた。
 * 同じことを 5 か所に書かない（CLAUDE.md 3 節）。
 *
 * ## キャストを使っていない理由
 *
 * `_getIconUrl` は `@types/leaflet` に無い内部の欄。宣言の仕方で 2 回失敗した。
 *
 *   1. `declare module "leaflet" { namespace Icon { ... } }`
 *      → tsc は通るが eslint が `@typescript-eslint/no-namespace` を
 *        **error** で出す。lint は error 0 が条件（CLAUDE.md 1 節）
 *   2. 内部の欄だけを持つ interface に代入
 *      → 共通の欄が無く tsc が TS2559（weak type）で落ちる
 *
 * 交差型にすると代入がそのまま通り、キャストも namespace も要らない。
 */
type LeafletIconWithInternals = L.Icon.Default & { _getIconUrl?: string };

/**
 * 既定アイコンの URL の組み立てを止める。
 *
 * **呼んだあとに `L.Icon.Default.mergeOptions` で URL を指定すること。**
 * 指定しないとマーカーが出ない。
 */
export function clearLeafletDefaultIconUrl(): void {
  const prototype: LeafletIconWithInternals = L.Icon.Default.prototype;
  delete prototype._getIconUrl;
}
