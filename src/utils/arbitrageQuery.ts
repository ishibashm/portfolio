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
 * 相場の基準値。取得した件数ではなく条件に合う全件から出す。
 *
 * ㎡単価だけでなく面積・築年数・駅徒歩の分布も返す。広さや建物の軸は
 * 「この検索条件の中で相対的にどうか」で見ないと、地方と都心で同じ 60 ㎡が
 * 同じ評価になってしまう。
 */
const STATS_PROJECTION = `avg(sqm_rent) AS mean,
                 coalesce(stddev_pop(sqm_rent), 0) AS stddev,
                 count(*) AS n,
                 avg(size_sqm::float8) AS size_mean,
                 coalesce(stddev_pop(size_sqm::float8), 0) AS size_stddev,
                 avg(building_age::float8) AS age_mean,
                 coalesce(stddev_pop(building_age::float8), 0) AS age_stddev,
                 avg(minutes_to_station::float8) AS station_mean,
                 coalesce(stddev_pop(minutes_to_station::float8), 0) AS station_stddev`;

export function statsSql(whereSql: string, dedupe: boolean): string {
  return `SELECT ${STATS_PROJECTION}
            FROM (${innerSql(whereSql, dedupe)}) t`;
}

/**
 * 市区町村ごとの㎡単価の中央値。localValue 軸の基準。
 *
 * 平均ではなく中央値を使う。賃貸の㎡単価は上に長い裾を持つので、
 * 数件の高額物件で平均が持ち上がり、街全体が割安に見えてしまう。
 */
/**
 * 統計に必要な列だけに絞った名寄せ済み集合。
 *
 * innerSql は候補行そのものを返すので `*` を並べるが、統計側が読むのは
 * 5 列だけ。CTE に載せて実体化すると、幅がそのまま一時ファイルの量になる。
 *
 * 2026-08-09 の実測（prefecture=all）
 *   innerSql をそのまま CTE に  width=407, temp read/written 38,214 blocks
 *   単独で投げていたとき        width=366 / 40, 同 18,989 blocks
 *
 * 実体化した 39 万行を 2 箇所から読むので、幅を落とさないと統合の利得が
 * 一時ファイルの往復で相殺される。listing_count（count(*) OVER）も
 * 統計側は使わないので外す。窓関数の評価が 1 回まるごと減る。
 *
 * DISTINCT ON は ORDER BY の先頭と一致していればよく、選択リストに
 * キーを含める必要は無い。名寄せの結果は innerSql と同じ。
 */
function statsInnerSql(whereSql: string, dedupe: boolean): string {
  const cols = `${SQM_RENT_SQL} AS sqm_rent,
                size_sqm, building_age, minutes_to_station,
                municipality_key AS municipality`;
  return dedupe
    ? `SELECT DISTINCT ON (${DEDUPE_KEY_SQL}) ${cols}
         FROM rental_properties
        WHERE ${whereSql}
        ORDER BY ${DEDUPE_KEY_SQL}, ${PICK_ORDER_SQL}`
    : `SELECT ${cols}
         FROM rental_properties
        WHERE ${whereSql}`;
}

const MUNICIPALITY_PROJECTION = `municipality,
                 count(*)::int AS n,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY sqm_rent) AS median`;

export function municipalityStatsSql(
  whereSql: string,
  dedupe: boolean,
): string {
  return `SELECT ${MUNICIPALITY_PROJECTION}
            FROM (${innerSql(whereSql, dedupe)}) t
           WHERE municipality IS NOT NULL
        GROUP BY municipality`;
}

/**
 * 相場の基準値と市区町村の中央値を 1 回の評価でまとめて出す。
 *
 * この 2 つは同じ innerSql を見る。別々のクエリとして投げると、
 * DISTINCT ON のための 45 万行のソートが 2 回走る。ソートキーには
 * 建物名から名寄せキーを作る regexp_replace が入っているので、
 * 行ごとの正規表現評価まで丸ごと 2 回になる。
 *
 * 2026-08-09 の実測（prefecture=all、索引適用後）
 *   statsSql              5,373 ms
 *   municipalityStatsSql  8,700 ms
 *
 * MATERIALIZED を明示するのは、付けないと Postgres が CTE を
 * インライン展開して結局 2 回評価しうるため。ここは 1 回で確定させたい。
 *
 * 結果は 1 行 2 列の JSON で返す。行の形が違うものを 1 文で返すには
 * これが要る。中身は数値と文字列だけで日付を含まないので、JSON を
 * 経由しても型が壊れない。
 *
 * 意味は分けて投げていたときと同じ。射影は statsSql /
 * municipalityStatsSql と同じ定数を使っており、片方だけ直る余地は無い。
 */
export function statsAndMunicipalitySql(
  whereSql: string,
  dedupe: boolean,
): string {
  return `WITH d AS MATERIALIZED (${statsInnerSql(whereSql, dedupe)})
          SELECT
            (SELECT row_to_json(s) FROM (
               SELECT ${STATS_PROJECTION} FROM d
             ) s) AS stats,
            (SELECT coalesce(json_agg(m), '[]'::json) FROM (
               SELECT ${MUNICIPALITY_PROJECTION}
                 FROM d
                WHERE municipality IS NOT NULL
             GROUP BY municipality
             ) m) AS municipalities`;
}
