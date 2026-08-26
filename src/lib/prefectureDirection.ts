import prefectureCenters from "@/data/prefectureCenters.json";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";
import type { EightDirection } from "@/utils/ephemerisEngine";

/**
 * 県の地理的な代表点（面積重心）。public/prefectures.geojson から
 * scripts/build_prefecture_centers.ts が生成する。
 *
 * 俯瞰の県塗りは「出発地から県の代表点への方位」で県全体を 1 つの方位に
 * 割り当てる。以前は SCRAPE_TARGETS の座標（スクレイパーの巡回起点＝
 * 概ね県庁所在地）を流用していたが、県庁は県の端にあることが多い。
 * 兵庫の代表点が神戸（県の南東端）だったため、京都からだと県の北半分が
 * 北西にあるのに県全体が「南西」の判定色で塗られていた（利用者報告
 * 2026-08-27）。重心なら塗っているポリゴンの真ん中を指す。
 */
export const PREFECTURE_CENTERS = prefectureCenters as Record<
  string,
  { lat: number; lon: number }
>;

/**
 * 出発地から見た各県の方位。arbitrage と timing の県塗りが両方これを
 * 使う（同じ割り当てを 2 か所に書かない）。
 *
 * @param nodeMapping 八方位の区切り。traditional = 気学の伝統区分
 *   （四正 30 度・四隅 60 度）、physical = 45 度等分。
 */
export function prefectureDirections(
  baseLat: number,
  baseLon: number,
  nodeMapping: "traditional" | "physical",
): Record<string, EightDirection> {
  const out: Record<string, EightDirection> = {};
  for (const [name, c] of Object.entries(PREFECTURE_CENTERS)) {
    out[name] = directionFromBearing(
      bearingBetween(baseLat, baseLon, c.lat, c.lon),
      nodeMapping,
    );
  }
  return out;
}
