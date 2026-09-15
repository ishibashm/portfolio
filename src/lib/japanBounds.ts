/**
 * 日本の範囲と、「出発地として使える座標か」の判定。
 *
 * ## なぜ 1 つにするか
 *
 * 同じ枠が 4 か所に写されていた（`SpotVerdict` の `parseCoordinates`、
 * `api/relocation/appraisal`、`lib/mcpServer` の 2 つ）。数字が散ると、
 * 片方だけ直したときに**同じ入力を片方は通し片方は弾く**ようになる。
 *
 * ## なぜ「有限な数」では足りないか
 *
 * **2026-09-15 に実害が出た。**物件検索の「この地点を調べる」は出発地を
 *
 *     baseLat={Number(baseLat)}   // baseLat の初期値は ""
 *
 * で受け取っており、`Number("")` は **`NaN` ではなく `0`**。受け取る側の
 * 守りが `Number.isFinite()` だったので **0 は「入っている」と判定され**、
 * 緯度 0・経度 0（ギニア湾）から方位と距離を計算していた。実機で
 *
 *     愛知県名古屋市中区   NE   約14083.5km
 *
 * と出る。距離が桁違いなのは目で分かるが、**方位（NE）は一見それらしく、
 * 気付けない。**
 *
 * 同じページの地図は `hasBaseLocation` という正しい旗を使っていて、
 * **この呼び出しだけが外にいた。**CLAUDE.md 3 節「設定には利用者の値だけを
 * 書く」で 3 回踏んでいるのと同じ形（守りはあるのに 1 か所だけ通っていない）。
 *
 * 呼び出し側を直すだけでは、次に足す呼び出しで同じことが起きる。
 * **受け取る側で「日本の座標か」を見る。**
 */

/**
 * 日本をおおよそ含む枠。南は波照間、北は択捉まで入る大きさ。
 *
 * **判定に使う枠ではない**（方位も距離も真の座標で計算する）。
 * 「入力として受け付けてよい値か」を見るためだけのもの。
 */
export const JAPAN_BOUNDS = {
  minLat: 20,
  maxLat: 46,
  minLon: 122,
  maxLon: 154,
} as const;

/** 日本の範囲に収まる座標か。有限でない値は false。 */
export function isInJapan(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= JAPAN_BOUNDS.minLat &&
    lat <= JAPAN_BOUNDS.maxLat &&
    lon >= JAPAN_BOUNDS.minLon &&
    lon <= JAPAN_BOUNDS.maxLon
  );
}

/**
 * 出発地として使える座標か。
 *
 * `isInJapan` と同じ判定だが、**呼ぶ側の意図が違う**ので名前を分ける。
 * こちらは「利用者が出発地を入れ終えているか」を聞いている。未入力を
 * `0` で渡されても、ここで止まる。
 */
export function hasUsableBase(lat: number, lon: number): boolean {
  return isInJapan(lat, lon);
}
