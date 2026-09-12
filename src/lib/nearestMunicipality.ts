/**
 * 座標から**一番近い市区町村**を引く（純粋関数）。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-12）
 *
 * 出発地・出生地が画面に「35.689 / 139.692」のような座標と出ていて、
 * 自分が何を入れたのか読めない。地名で選んだときの名前は端末にしか
 * 残さない決め（クラウドへ送る個人情報を増やさない）なので、別の端末や
 * 控えの一覧では座標しか無い。**座標から地名へ戻す口**があれば、どこでも
 * 「東京都千代田区 付近」と出せる。
 *
 * 母集団は `municipalityCoords`（全国 1,894 の代表点。出典は
 * geolonia/japanese-addresses の大字の平均）。代表点どうしの間隔は
 * 数 km なので、**「付近」までしか言えない**。町名は出さない。
 * それで足りる（自分が入れた場所を思い出せればよい）。
 *
 * 外部サービスには出さない。読むのは同梱の JSON だけ。
 */

import { distanceKmBetween } from "@/utils/directionGeo";
import type { MunicipalityPoint } from "./municipalityCoords";

export interface NearestMunicipality {
  code: string;
  pref: string;
  city: string;
  /** 「東京都千代田区」。 */
  name: string;
  distanceKm: number;
}

/**
 * 遠すぎる点には名前を付けない。海上や国外の座標に、たまたま一番近い
 * 離島の名前が付くのを防ぐ。代表点の間隔（数 km〜数十 km）より少し
 * 広く取る。
 */
export const MAX_NEAREST_KM = 60;

export function nearestMunicipality(
  lat: number,
  lon: number,
  points: readonly MunicipalityPoint[],
  maxKm: number = MAX_NEAREST_KM,
): NearestMunicipality | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: MunicipalityPoint | null = null;
  let bestKm = Infinity;
  for (const p of points) {
    const km = distanceKmBetween(lat, lon, p.lat, p.lon);
    if (km < bestKm) {
      bestKm = km;
      best = p;
    }
  }
  if (!best || bestKm > maxKm) return null;
  return {
    code: best.code,
    pref: best.pref,
    city: best.city,
    name: `${best.pref}${best.city}`,
    distanceKm: Math.round(bestKm * 10) / 10,
  };
}
