import {
  bearingBetween,
  COMPASS_DIRECTIONS,
  directionFromBearing,
  distanceKmBetween,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 地価公示・都道府県地価調査の地点を、出発地から見た**方位ごと**にまとめる。
 *
 * ## なぜ要るか（2026-09-11）
 *
 * 利用者の要望は「土地の売り出しデータを取得して表示したい」だった。
 * **売り出し中の在庫は、規約上どのポータルからも取れない**（CLAUDE.md
 * 3 節。ニフティとヤフーの 2 例で確認済み）。
 *
 * 一方、**土地そのものの値段は既に手元にある。**`land_price_points` は
 * 国交省の不動産情報ライブラリ（公式 API）から取り込んだ地点ごとの価格で、
 * 全国に座標つきで並んでいる。これまで `purchaseStats` が**県別の中央値**に
 * しか使っておらず、座標を持っているのに**地理的には一度も使っていなかった。**
 *
 * 成約価格（`property_transactions`）は建物込みの総額で、公開されるのも
 * 町名までなので「土地がいくらか」には遠い。**地価公示は更地の価格**なので、
 * 「この方位の土地はいくらか」にはこちらが素直。
 *
 * ## 方位の出し方
 *
 * `bearingBetween` → `directionFromBearing` の 1 本だけを使う。八方位へ
 * 落とす実装を新しく書かない（CLAUDE.md 3 節）。
 */

/** 集計に必要な列だけ。SQL 側は `land_price_points` から同じ名前で返す。 */
export interface LandPriceRow {
  point_id: string;
  year: number;
  land_price_type: number;
  price_per_sqm: number;
  lat: number;
  lon: number;
  use_category: string | null;
  prefecture: string | null;
  municipality: string | null;
}

export interface LandPriceDirectionStat {
  direction: CompassDirection;
  /** 集計に入った地点の数。**0 でも行を落とさない**（CLAUDE.md 2-c）。 */
  count: number;
  /** 円/㎡ の中央値。地点が無ければ null。 */
  medianPricePerSqm: number | null;
  p25PricePerSqm: number | null;
  p75PricePerSqm: number | null;
  /** いちばん近い地点までの km。目安として出す。 */
  nearestKm: number | null;
  /** 件数の多い順の市区町村名（最大 3 つ）。どこの話かを示す。 */
  topMunicipalities: string[];
}

/**
 * 方位が定まらないほど近い地点を外す既定値（km）。
 *
 * **これは「方位が定まるか」の規則であって、「土地があるか」の規則では
 * ない。**同じ数字を別の問いに流用して嘘を出した事故がある（#968。
 * `hasAnyMunicipality` が 5km のふるいを通した母集団で「街の有無」を
 * 数えていた）。ここでは方位ごとの集計にしか使わない。
 *
 * 出発地から 1km の地点は、出発地の座標がわずかに違うだけで北にも東にも
 * なる。方位別に並べる表で、そういう地点を特定の方位に置くと読み手を
 * 誤らせる。
 */
export const DEFAULT_MIN_KM = 5;

/** 遠すぎる地点を外す既定値（km）。全国の中央値になってしまうのを防ぐ。 */
export const DEFAULT_MAX_KM = 150;

export interface LandPriceDirectionOptions {
  minKm?: number;
  maxKm?: number;
  /** 「住宅地」など。指定すると `use_category` が一致する地点だけを見る。 */
  useCategory?: string | null;
}

/** 昇順に並んだ配列の分位点。線形補間はしない（件数が少ないため）。 */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[at];
}

/**
 * 同じ地点が年をまたいで複数行あるので、**いちばん新しい年だけ**を残す。
 *
 * 鍵は `point_id` と `land_price_type` の組。整理番号が地価公示と
 * 都道府県地価調査で一意である保証が無く、片方がもう片方を消しうる
 * （schema.prisma の註と同じ理由）。
 */
export function latestPerPoint(rows: readonly LandPriceRow[]): LandPriceRow[] {
  const best = new Map<string, LandPriceRow>();
  for (const row of rows) {
    const key = `${row.land_price_type}:${row.point_id}`;
    const seen = best.get(key);
    if (!seen || row.year > seen.year) best.set(key, row);
  }
  return [...best.values()];
}

/**
 * 出発地から見た方位ごとに地価をまとめる。
 *
 * **8 方位を必ず全部返す。**地点が無い方位も `count: 0` で返し、呼ぶ側が
 * 「その方位には材料が無い」と書けるようにする。黙って消すと、同じ画面の
 * 他の表と方位の数が食い違う（CLAUDE.md 2-c）。
 */
export function landPricesByDirection(
  rows: readonly LandPriceRow[],
  baseLat: number,
  baseLon: number,
  options: LandPriceDirectionOptions = {},
): LandPriceDirectionStat[] {
  const minKm = options.minKm ?? DEFAULT_MIN_KM;
  const maxKm = options.maxKm ?? DEFAULT_MAX_KM;
  const useCategory = options.useCategory ?? null;

  const prices = new Map<CompassDirection, number[]>();
  const nearest = new Map<CompassDirection, number>();
  const municipalities = new Map<CompassDirection, Map<string, number>>();
  for (const d of COMPASS_DIRECTIONS) {
    prices.set(d, []);
    municipalities.set(d, new Map());
  }

  for (const row of latestPerPoint(rows)) {
    if (useCategory && row.use_category !== useCategory) continue;
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
    if (!Number.isFinite(row.price_per_sqm) || row.price_per_sqm <= 0) continue;

    const km = distanceKmBetween(baseLat, baseLon, row.lat, row.lon);
    if (km < minKm || km > maxKm) continue;

    /* 判定と同じ真北の方位角で切る。磁北は使わない（CLAUDE.md 3 節） */
    const bearing = bearingBetween(baseLat, baseLon, row.lat, row.lon);
    const direction = directionFromBearing(bearing, "traditional");

    prices.get(direction)!.push(row.price_per_sqm);
    const near = nearest.get(direction);
    if (near === undefined || km < near) nearest.set(direction, km);
    if (row.municipality) {
      const counts = municipalities.get(direction)!;
      counts.set(row.municipality, (counts.get(row.municipality) ?? 0) + 1);
    }
  }

  return COMPASS_DIRECTIONS.map((direction) => {
    const sorted = prices
      .get(direction)!
      .slice()
      .sort((a, b) => a - b);
    const counts = municipalities.get(direction)!;
    const topMunicipalities = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .slice(0, 3)
      .map(([name]) => name);
    return {
      direction,
      count: sorted.length,
      medianPricePerSqm: quantile(sorted, 0.5),
      p25PricePerSqm: quantile(sorted, 0.25),
      p75PricePerSqm: quantile(sorted, 0.75),
      nearestKm: nearest.get(direction) ?? null,
      topMunicipalities,
    };
  });
}
