import {
  MUNICIPALITY_POINTS,
  type MunicipalityPoint,
} from "@/lib/municipalityCoords";
import { distanceKmBetween } from "@/utils/directionGeo";

/**
 * その座標が「だいたいどこか」を、手元のデータだけで言う。
 *
 * ## なぜ要るか（2026-09-05、利用者の報告）
 *
 * 「その地点がそもそもどこに当たるのかが分からない」
 *
 * 地図で地点を選んでも、画面に出るのは `35.681236, 139.767125` の
 * ような数字だけだった。**自分が今どこを見ているのか分からないまま
 * 吉凶だけが出る。**
 *
 * ## 外部に問い合わせない
 *
 * 逆引き（座標 → 住所）の API は持っていない。足すこともできるが、
 * **地点を選ぶたびに外部へ要求を出す**ことになる。相手への負荷を
 * 新しく作らない、というのがこのリポジトリの方針。
 *
 * 手元に全国 1,894 市区町村の代表点がある（`municipalityCoords`）。
 * 最寄りを引けば、要求ゼロ・即時で「どのあたりか」は言える。
 *
 * ## これは住所ではない。**近くの市区町村**
 *
 * 返すのは「その座標を含む自治体」ではなく「**代表点がいちばん近い
 * 自治体**」。代表点は大字・町丁目の平均なので、
 *
 * - 市域が広いと、隣の市の代表点のほうが近いことがある
 * - 境目の近くでは、隣の自治体が返りうる
 *
 * だから画面には**「〜付近」**と書く。「〜市です」と断定しない。
 * 距離も返すので、遠ければ呼ぶ側が出し方を変えられる。
 *
 * ## 判定には使わない
 *
 * `municipalityCoords` の註のとおり、この表は方位の判定にも一覧の
 * 並びにも使わない。座標の作り方が `areaDirections` と違い、混ぜると
 * 答えが動く。**ここで返すのは画面に出す名前だけ。**
 */

export interface NearestPlace {
  code: string;
  pref: string;
  city: string;
  /** 代表点までの距離。遠いほど「付近」の確からしさが落ちる。 */
  distanceKm: number;
}

/**
 * 代表点がいちばん近い市区町村。
 *
 * 1,894 件の総当たり。1 回あたり数十マイクロ秒で、地点を選ぶたびに
 * 呼んでも効かない。索引を作るほどの数ではない。
 */
export function nearestMunicipality(
  lat: number,
  lon: number,
): NearestPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let best: MunicipalityPoint | null = null;
  let bestKm = Infinity;
  for (const m of MUNICIPALITY_POINTS) {
    const km = distanceKmBetween(lat, lon, m.lat, m.lon);
    if (km < bestKm) {
      bestKm = km;
      best = m;
    }
  }
  if (!best) return null;
  return {
    code: best.code,
    pref: best.pref,
    city: best.city,
    distanceKm: bestKm,
  };
}

/**
 * 画面にそのまま出す一文。**断定しない。**
 *
 * 遠いときは、そのことも書く。海の上や山中を選ぶと最寄りでも数十km
 * 離れるので、「〜付近」とだけ書くと嘘になる。
 */
export function nearestPlaceLabel(place: NearestPlace | null): string | null {
  if (!place) return null;
  const name = `${place.pref}${place.city}`;
  if (place.distanceKm < 15) return `${name}付近`;
  return `${name}から約${Math.round(place.distanceKm)}km`;
}
