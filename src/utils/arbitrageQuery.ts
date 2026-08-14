/**
 * Real Estate Arbitrage Scanner が rental_properties から候補を切り出すための
 * SQL 組み立て。
 *
 * API ルート（/api/rentals/arbitrage）に直書きされていたが、名寄せ・相場統計・
 * 市区町村の抽出はいずれも正しさが SQL の細部に乗っており、壊れても画面上は
 * 「なんとなく順位が変」としてしか現れない。Next のルートファイルは
 * HTTP ハンドラ以外を export できないため、テストから触れるようにここへ移した。
 */
import { CandidateStrategy } from "@/utils/arbitrageScoring";

// 物件名から不要な階数や築年数表現を除去するクレンジング関数
export function cleanPropertyName(name: string): string {
  if (!name) return "";
  return name
    .replace(
      /[\s　]*(?:地下)?\d+階[\s　]+(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/,
      "",
    )
    .replace(/[\s　]*(?:築\d+年(?:[0-9]+ヶ月)?|新築)の賃貸物件$/, "")
    .trim();
}

/**
 * 名寄せキー（建物名）は name_key 列を読む。
 *
 * 以前はここに regexp_replace の式があり、リクエストのたびに対象行
 * それぞれへ評価していた。全国走査 22 秒の律速がこの CPU だと
 * EXPLAIN ANALYZE で確定したため（2026-08-14。work_mem を広げても
 * 変わらなかった）、書き込み時にトリガーで埋めた列を読む形にした。
 *
 * 式そのものは prisma/sql/20260814_add_rental_dedupe_keys.sql の
 * トリガーに移してある。cleanPropertyName（JS 版）と後置きの落とし方が
 * ずれると重複が残るのは変わらないので、**変えるときは 3 か所
 * （JS・トリガー・バックフィル）を必ず揃える**。
 */

const SQM_RENT_SQL = `((rent + COALESCE(management_fee, 0))::float8 / size_sqm::float8)`;

/**
 * 住所から市区町村キーを作る。近隣相場（localValue 軸）の集計単位。
 *
 * 広域の平均だけで割安判定をすると、都心と郊外が同じ母集団に入り、
 * 「郊外はどれも割安・都心はどれも割高」という当たり前の結論しか出ない。
 * 同じ街の中での歪みを見るために市区町村で切る。
 *
 * 都道府県名は明示列挙する。`.+?[都道府県]` にすると「京都府〇〇」が
 * 「京」+「都」で切れる。政令市は「名古屋市中区」まで含めないと、
 * 市全体が 1 つの相場になって区ごとの差が消える。
 */
/**
 * 市区町村キーは municipality_key 列を読む（住所の正規表現 5 回ぶんが
 * 行ごとに消える）。式はトリガー側。上の name_key と同じ注意。
 */

/**
 * 同じ部屋の重複掲載をまとめるキー。
 *
 * Nifty は HOME'S / SUUMO / at home / いい部屋ネット など複数社の掲載を
 * そのまま並べるため、同一の部屋が別 URL で最大18件重なる。住所の書き方が
 * 会社ごとに違う（「四番町」と「七本松通下長者町上る東入四番町」）ので
 * 住所も座標もキーに使えない。建物名・階・間取り・面積・賃料の一致で
 * 同じ部屋とみなす。
 */
const DEDUPE_KEY_SQL = `name_key, floor, layout, size_sqm, rent`;

/**
 * 残す1件を選ぶ順序。同じ部屋でも会社によって駅徒歩や管理費が欠けるため、
 * 埋まっているものを優先し、同点なら新しく確認できたほうを取る。
 */
const PICK_ORDER_SQL = `
  ((minutes_to_station IS NOT NULL)::int + (building_age IS NOT NULL)::int
   + (management_fee IS NOT NULL)::int + (expire_date IS NOT NULL)::int) DESC,
  last_seen_at DESC NULLS LAST`;

export interface GeoFilters {
  maxSeenDays: number;
  maxBuildingAge: number | null;
  radiusKm: number;
  baseLat: number;
  baseLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  prefecture: string | null;
}

/**
 * findMany に渡している whereClause と同じ条件を SQL 化する。
 * 値は必ずプレースホルダで渡す（prefecture はクエリ文字列由来のため）。
 */
export function buildWhereSql(f: GeoFilters): { sql: string; params: any[] } {
  const parts = [
    "lat IS NOT NULL",
    "lon IS NOT NULL",
    "rent IS NOT NULL",
    "size_sqm IS NOT NULL",
    "size_sqm > 0",
    // 掲載期限を過ぎた物件は詳細ページが 404 になる。
    // expire_date が未取得（古い行）のものは判定できないので除外しない。
    "(expire_date IS NULL OR expire_date >= now())",
  ];
  const params: any[] = [];
  const ph = () => `$${params.length}`;

  if (f.maxSeenDays > 0) {
    params.push(new Date(Date.now() - f.maxSeenDays * 24 * 60 * 60 * 1000));
    parts.push(`last_seen_at >= ${ph()}`);
  }
  if (f.maxBuildingAge !== null && !isNaN(f.maxBuildingAge)) {
    params.push(f.maxBuildingAge);
    parts.push(`building_age <= ${ph()}`);
  }

  if (f.radiusKm > 0 && !isNaN(f.baseLat) && !isNaN(f.baseLon)) {
    const deltaLat = f.radiusKm / 111.0;
    const deltaLon =
      f.radiusKm / (111.0 * Math.cos((f.baseLat * Math.PI) / 180.0));
    params.push(f.baseLat - deltaLat);
    parts.push(`lat >= ${ph()}`);
    params.push(f.baseLat + deltaLat);
    parts.push(`lat <= ${ph()}`);
    params.push(f.baseLon - deltaLon);
    parts.push(`lon >= ${ph()}`);
    params.push(f.baseLon + deltaLon);
    parts.push(`lon <= ${ph()}`);
  } else if (
    !isNaN(f.minLat) &&
    !isNaN(f.maxLat) &&
    !isNaN(f.minLon) &&
    !isNaN(f.maxLon)
  ) {
    params.push(f.minLat);
    parts.push(`lat >= ${ph()}`);
    params.push(f.maxLat);
    parts.push(`lat <= ${ph()}`);
    params.push(f.minLon);
    parts.push(`lon >= ${ph()}`);
    params.push(f.maxLon);
    parts.push(`lon <= ${ph()}`);
  }

  if (f.prefecture && f.prefecture !== "all") {
    params.push(f.prefecture);
    parts.push(`address LIKE ${ph()} || '%'`);
  }

  return { sql: parts.join(" AND "), params };
}

/**
 * 名寄せ後の候補集合。ここが全ての評価軸の入力になる。
 *
 * listing_count は名寄せでまとめた掲載数（＝この部屋を出している仲介会社の数）。
 * DISTINCT ON は窓関数の後に効くので、まとめる前の件数がそのまま残る。
 * 何社が出しているかは「まだ広く出回っていない出物か」の指標になるため、
 * 捨てずに market 軸へ渡す。
 */
export function innerSql(whereSql: string, dedupe: boolean): string {
  const extraCols = `${SQM_RENT_SQL} AS sqm_rent, municipality_key AS municipality`;
  return dedupe
    ? `SELECT DISTINCT ON (${DEDUPE_KEY_SQL}) *, ${extraCols},
              count(*) OVER (PARTITION BY ${DEDUPE_KEY_SQL})::int AS listing_count
         FROM rental_properties
        WHERE ${whereSql}
        ORDER BY ${DEDUPE_KEY_SQL}, ${PICK_ORDER_SQL}`
    : `SELECT *, ${extraCols}, 1 AS listing_count
         FROM rental_properties
        WHERE ${whereSql}`;
}

/**
 * 候補を切り出す順序。
 *
 * DB 全件をスコアリングはできないので SQL 側で limit 件に絞るが、
 * その切り方が固定だと重みを変えても候補集合が変わらない。
 * 「駅アクセス重視」に切り替えたのに駅近物件が母集合に入っていない、
 * ということが起きるため、抽出の角度も選べるようにする。
 */
export function candidateOrderSql(strategy: CandidateStrategy): string {
  switch (strategy) {
    case "balanced":
      // 単一指標だと必ずどこかに偏るので、4 指標の順位を合成して均す。
      return `(
        percent_rank() OVER (ORDER BY sqm_rent) * 0.4
        + percent_rank() OVER (ORDER BY COALESCE(building_age, 60)) * 0.25
        + percent_rank() OVER (ORDER BY COALESCE(minutes_to_station, 30)) * 0.2
        + percent_rank() OVER (ORDER BY size_sqm DESC) * 0.15
      ) ASC`;
    case "newest":
      return `COALESCE(building_age, 999) ASC, sqm_rent ASC`;
    case "spacious":
      return `size_sqm DESC, sqm_rent ASC`;
    case "station":
      return `COALESCE(minutes_to_station, 999) ASC, sqm_rent ASC`;
    case "fresh":
      return `first_seen_at DESC NULLS LAST, sqm_rent ASC`;
    case "value":
    default:
      return `sqm_rent ASC`;
  }
}

export function selectSql(
  whereSql: string,
  dedupe: boolean,
  limitPlaceholder: number,
  strategy: CandidateStrategy,
): string {
  return `SELECT * FROM (${innerSql(whereSql, dedupe)}) t
           ORDER BY ${candidateOrderSql(strategy)}
           LIMIT $${limitPlaceholder}`;
}

/**
 * 名寄せ後の件数だけを数える。
 *
 * 以前は相場の統計（statsAndMunicipalitySql）の副産物として取っていたが、
 * 評価軸の廃止で統計そのものが要らなくなった。件数のためだけに
 * DISTINCT ON の実体化を残すのは高くつくので、GROUP BY で数える。
 * 名寄せキーの索引（rental_properties_name_key_..._idx）の並びのまま
 * 集約できるため、ソートが要らない。
 */
export function uniqueCountSql(whereSql: string): string {
  return `SELECT count(*)::int AS n
            FROM (SELECT 1
                    FROM rental_properties
                   WHERE ${whereSql}
                GROUP BY ${DEDUPE_KEY_SQL}) t`;
}
