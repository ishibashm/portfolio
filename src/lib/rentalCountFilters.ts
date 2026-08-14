import { Prisma } from "@prisma/client";
import { LIVE_LISTING_SQL } from "@/lib/rentalListingSql";

/**
 * 「絞り込みを掛けた状態で数える」口が共通で使う条件の組み立て。
 *
 * 同じ 5 つの条件が複数の口で要る。
 *   - /api/rentals/arbitrage/prefecture-counts  県ごとの件数
 *   - /api/rentals/arbitrage/viewport-count     地図の表示範囲の件数
 *
 * **片方だけ直すと、同じ絞り込みなのに県の合計と表示範囲の数が食い違う。**
 * どちらが正しいのか画面からは分からないので、条件は 1 か所に置く
 * （掲載中の定義を lib/rentalListingSql に集めてあるのと同じ理由）。
 *
 * ここで数えるのは **SQL で表せる条件だけ**。
 *
 *   数えられる   家賃上限・間取り・築年数上限・徒歩分上限・広さ下限
 *   数えられない 方位、吉凶、総合スコア、利回り偏差、お気に入り
 *
 * 後者は出発地・生年月日から画面側で計算する値で、DB の列に無い。混ぜて
 * 1 つの数字にすると「方位で絞ったのに減らない」に見えるので、**何で
 * 絞ったかを返し、画面はそれを添えて出す。**
 */

/** 数値のクエリ。壊れた値・負の値は「指定なし」に倒す。 */
export function positiveNumber(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * 間取りの一致。画面側（filterLayouts）と同じ規則にする。
 *
 * 画面は UPPER した layout の**部分一致**で見ている。ここも同じにする。
 * 前方一致にすると "2LDK" が "ワンルーム2LDK" のような表記を落とし、
 * 同じ条件なのに件数と一覧が食い違う。
 */
export function layoutPatterns(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && s.length <= 8)
    .slice(0, 20)
    .map((s) => `%${s}%`);
}

/**
 * SQL で表せない絞り込み。応答に載せて、画面が「これは反映していません」
 * と添えられるようにする。
 */
export const UNSUPPORTED_COUNT_FILTERS = [
  "direction",
  "astrologyStatus",
  "luckyOnly",
  "minTotalScore",
  "minYield",
  "favoritesOnly",
] as const;

export type CountFilters = {
  /** LIVE_LISTING_SQL を先頭に含む、AND で繋ぐ条件の並び。 */
  conditions: Prisma.Sql[];
  /** 実際に効いた絞り込みの名前。何も指定が無ければ空。 */
  appliedFilters: string[];
};

/**
 * クエリ文字列から数え上げの条件を作る。
 *
 * 先頭は必ず「掲載中」の条件。絞り込みが空なら、毎晩の静的ファイル
 * （build_area_dataset.ts）と同じ数字になるはずで、ずれたらどちらかが
 * 壊れている。
 */
export function buildCountFilters(searchParams: URLSearchParams): CountFilters {
  const maxRentMan = positiveNumber(searchParams.get("maxRentMan"));
  const maxBuildingAge = positiveNumber(searchParams.get("maxBuildingAge"));
  const maxStationMin = positiveNumber(searchParams.get("maxStationMin"));
  const minSizeSqm = positiveNumber(searchParams.get("minSizeSqm"));
  const layouts = layoutPatterns(searchParams.get("layouts"));

  const conditions: Prisma.Sql[] = [Prisma.raw(LIVE_LISTING_SQL)];

  // 家賃は「総家賃 = 賃料 + 管理費」で比べる。画面の filterMaxRent と
  // 同じ。賃料だけで比べると、管理費の高い物件が上限内に見える。
  if (maxRentMan !== null) {
    conditions.push(
      Prisma.sql`rent + coalesce(management_fee, 0) <= ${Math.round(maxRentMan * 10000)}`,
    );
  }
  // 未取得（NULL）は落とす。画面側も「条件を満たす保証が無い」として
  // 外している。ここだけ残すと件数が一覧より多く出る。
  if (maxBuildingAge !== null) {
    conditions.push(Prisma.sql`building_age <= ${Math.round(maxBuildingAge)}`);
  }
  if (maxStationMin !== null) {
    conditions.push(
      Prisma.sql`minutes_to_station <= ${Math.round(maxStationMin)}`,
    );
  }
  if (minSizeSqm !== null) {
    conditions.push(Prisma.sql`size_sqm >= ${minSizeSqm}`);
  }
  if (layouts.length > 0) {
    conditions.push(
      Prisma.sql`(${Prisma.join(
        layouts.map((p) => Prisma.sql`upper(coalesce(layout, '')) LIKE ${p}`),
        " OR ",
      )})`,
    );
  }

  const appliedFilters = [
    maxRentMan !== null && "maxRentMan",
    maxBuildingAge !== null && "maxBuildingAge",
    maxStationMin !== null && "maxStationMin",
    minSizeSqm !== null && "minSizeSqm",
    layouts.length > 0 && "layouts",
  ].filter((v): v is string => typeof v === "string");

  return { conditions, appliedFilters };
}
