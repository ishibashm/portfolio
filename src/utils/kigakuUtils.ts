import { EightDirection } from "./ephemerisEngine";
import { directionFromBearing } from "./directionGeo";

/**
 * 方位角（0°〜360°）を八方位に落とす。
 *
 * 区切りの定義そのものは utils/directionGeo に一本化した。同じ「方位角を
 * 八方位に落とす」処理がこのリポジトリには 4 つあり、区切りは同じでも
 * 既定値が食い違っていた（ここは第 2 引数なしで physical、directionGeo は
 * traditional）。どれか 1 つを直しても他が古いままになる形だったので、
 * 実体は 1 つにして、ここは呼び名と引数の形を保つだけの薄い層にする。
 *
 * useClassical=true が気学の伝統区分（四正 30 度・四隅 60 度）、
 * false が 45 度の等分。directionGeo の traditional / physical に対応する。
 *
 *   N  345°〜15°   (30 度)      NE 15°〜75°    (60 度)
 *   E  75°〜105°   (30 度)      SE 105°〜165°  (60 度)
 *   S  165°〜195°  (30 度)      SW 195°〜255°  (60 度)
 *   W  255°〜285°  (30 度)      NW 285°〜345°  (60 度)
 */
export function getKigakuSector(
  bearing: number,
  useClassical: boolean = false,
  /* 方位角から出る方位は必ず八方位で、CENTER にはなり得ない。以前は
     Direction（CENTER 込み）を名乗っており、受け側が finalVectors を
     引くときに CENTER の可能性を型で否定できなかった。 */
): EightDirection {
  // NaN のときは北に倒す。directionFromBearing 自身も同じガードを持つように
  // なった（#740）が、規則がここ発祥であることと、二重でも答えが変わらない
  // ことから、入口の明示として残す。緯度経度が未入力のまま方位を引く経路が
  // あり、そこで「北西」と出ると入力漏れだと気付けない。
  if (isNaN(bearing)) return "N";

  return directionFromBearing(
    bearing,
    useClassical ? "traditional" : "physical",
  );
}
