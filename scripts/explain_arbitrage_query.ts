/**
 * スキャナーが実際に投げるクエリを EXPLAIN ANALYZE する。
 *
 * 「スキャンが終わらない」の原因を推測ではなく実測で決めるために要る。
 * SQL をここに書き写すとコード側とずれるので、API と同じ
 * src/utils/arbitrageQuery.ts の関数から組み立てる。
 *
 * /api/rentals/arbitrage は 1 リクエストで次を投げる。
 *
 *   1. selectSql              候補 500 件の取り出し
 *   2. count(*)               条件に合う総数
 *   3. max(last_seen_at)      鮮度表示。絞り込み条件を持たない
 *   4. statsSql               相場の基準値
 *   5. municipalityStatsSql   市区町村ごとの中央値
 *
 * 1・4・5 は同じ innerSql（DISTINCT ON ＋ 全体に対する count(*) OVER）を
 * それぞれ別のクエリとして評価する。同じ計算を 3 回している疑いがあり、
 * ここで 1 本ずつ時間を出す。
 *
 *   環境変数
 *     EXPLAIN_PREFECTURE   絞り込む都道府県。既定は "all"（最悪ケース）
 *     EXPLAIN_TIMEOUT_MS   1 本あたりの上限。既定 120000
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import {
  buildWhereSql,
  selectSql,
  statsAndMunicipalitySql,
  type GeoFilters,
} from "../src/utils/arbitrageQuery";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

const TIMEOUT_MS = parseInt(process.env.EXPLAIN_TIMEOUT_MS || "120000", 10);

// API の既定値に合わせる。route.ts の maxSeenDays=30 / dedupe=true /
// candidateStrategy="value" / limit=500。
const MAX_SEEN_DAYS = 30;
const DEDUPE = true;
const LIMIT = 500;

async function explain(pool: Pool, label: string, sql: string, params: any[]) {
  const started = Date.now();
  try {
    const r = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY) ${sql}`,
      params,
    );
    const plan = r.rows.map((row: any) => row["QUERY PLAN"] as string);
    const exec = plan.find((l) => l.startsWith("Execution Time:")) ?? "";
    const top = plan.slice(0, 6).join("\n");
    console.log(`\n===== ${label} =====`);
    console.log(exec || `(実測 ${Date.now() - started} ms)`);
    console.log(top);
  } catch (e: any) {
    // タイムアウトそのものが答えになる。落とさずに記録して次へ進む。
    console.log(`\n===== ${label} =====`);
    console.log(`失敗: ${e.message} （${Date.now() - started} ms 経過）`);
  }
}

/**
 * 測る条件。
 *
 * これまで prefecture=all / 半径なしだけを測っていたが、これは絞り込みが
 * 一切効かない最悪ケースで、実際の使い方とは違う。画面は出発地の入力が
 * 必須で、県か半径で絞って使う。そこでどれだけかかるのかを知らずに
 * 設計を変えると、要らない作り替えをすることになる。
 */
const SCENARIOS: Array<{ label: string; filters: Partial<GeoFilters> }> = [
  {
    label: "A. 全国・半径なし（絞り込みが効かない最悪ケース）",
    filters: { prefecture: "all", radiusKm: 0 },
  },
  {
    label: "B. 兵庫県・半径なし（県で絞る）",
    filters: { prefecture: "兵庫県", radiusKm: 0 },
  },
  {
    label: "C. 神戸から半径 30km・全国（出発地で絞る）",
    filters: {
      prefecture: "all",
      radiusKm: 30,
      baseLat: 34.6913,
      baseLon: 135.183,
    },
  },
  {
    // エリア別ページが対象にしている範囲（5〜150km）。既定値をここに置けるか。
    label: "E. 神戸から半径 150km・全国（エリアページと同じ範囲）",
    filters: {
      prefecture: "all",
      radiusKm: 150,
      baseLat: 34.6913,
      baseLon: 135.183,
    },
  },
  {
    label: "F. 東京から半径 150km・全国（在庫が最も多い側）",
    filters: {
      prefecture: "all",
      radiusKm: 150,
      baseLat: 35.6895,
      baseLon: 139.6917,
    },
  },
  {
    label: "D. 名古屋から半径 50km・愛知県（県と出発地の両方）",
    filters: {
      prefecture: "愛知県",
      radiusKm: 50,
      baseLat: 35.1815,
      baseLon: 136.9064,
    },
  },
];

const BASE_FILTERS: GeoFilters = {
  maxSeenDays: MAX_SEEN_DAYS,
  maxBuildingAge: null,
  radiusKm: 0,
  baseLat: NaN,
  baseLon: NaN,
  minLat: NaN,
  maxLat: NaN,
  minLon: NaN,
  maxLon: NaN,
  prefecture: "all",
};

async function main() {
  // 他のスクリプト（purge / build_area_dataset）と同じ作り方。
  // SSL は接続文字列の sslmode に任せる。
  const pool = new Pool({ connectionString, max: 1 });

  console.log(
    `maxSeenDays=${MAX_SEEN_DAYS} / 1 本あたりの上限 ${TIMEOUT_MS} ms`,
  );
  await pool.query(`SET statement_timeout = ${TIMEOUT_MS}`);
  // work_mem はサーバ既定（64MB）のまま測る。512MB を試したが、溢れが
  // 消えただけで時間は変わらなかった（2026-08-14 実測 22.1s → 22.8s）。
  // 律速はディスクではなく、行ごとの正規表現とソート比較の CPU。

  // 鮮度の集計だけは絞り込み条件を持たないので、条件ごとに測る意味が無い。
  await explain(
    pool,
    "鮮度 max(last_seen_at)（条件なし・全条件で共通）",
    "SELECT max(last_seen_at) FROM rental_properties",
    [],
  );

  for (const scenario of SCENARIOS) {
    const { sql: whereSql, params } = buildWhereSql({
      ...BASE_FILTERS,
      ...scenario.filters,
    });

    console.log(`\n\n##### ${scenario.label} #####`);

    // 母数が分からないと時間の意味が読めない。先に件数を出す。
    try {
      const r = await pool.query(
        `SELECT count(*)::int AS n FROM rental_properties WHERE ${whereSql}`,
        params,
      );
      console.log(`名寄せ前の対象行: ${r.rows[0].n.toLocaleString()} 行`);
    } catch (e: any) {
      console.log(`件数の取得に失敗: ${e.message}`);
    }

    await explain(
      pool,
      "候補の取り出し selectSql",
      selectSql(whereSql, DEDUPE, params.length + 1, "value"),
      [...params, LIMIT],
    );
    await explain(
      pool,
      "統計＋市区町村 statsAndMunicipalitySql（現行）",
      statsAndMunicipalitySql(whereSql, DEDUPE),
      params,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
