import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

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
 * **applyLeafletDefaultIcon の中でだけ使う。**これだけ呼んで
 * `mergeOptions` を忘れるとマーカーが 1 つも出なくなるので、
 * 外へは出さない（以前は export していて、呼び出し側 5 か所が
 * それぞれ URL を書いていた。行き先が 2 通りに割れた原因でもある）。
 */
function clearLeafletDefaultIconUrl(): void {
  const prototype: LeafletIconWithInternals = L.Icon.Default.prototype;
  delete prototype._getIconUrl;
}

/**
 * 既定マーカーの画像を、**同梱のものに**差し替える。
 *
 * **地図の部品はこれ 1 つだけ呼ぶ。**URL を自分で書く必要は無い。
 *
 * ## なぜ CDN をやめたか
 *
 * 5 か所すべてが CDN を指していたが、**行き先が 2 通りに割れていた。**
 *
 *   ArbitrageMapInner / MagneticMapInner  cdnjs の leaflet **1.7.1**
 *   LocationPickerInner / SimulatorMap /
 *   PastMoveMap                          unpkg の leaflet **1.9.4**
 *
 * package.json の leaflet は 1.9.4 なので、前者は**入っている版と
 * 違う版の画像**を取りに行っていた。今は同じ絵なので見た目に出て
 * いないだけで、揃っている理由が無い。
 *
 * node_modules の leaflet には同じ画像が入っている。バンドラに通せば
 * 版は常に一致し、外部の CDN が落ちてもマーカーが消えない。取りに
 * 行く先が 1 つ減るので、初回表示も速くなる。
 */
export function applyLeafletDefaultIcon(): void {
  clearLeafletDefaultIconUrl();
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
  });
}
