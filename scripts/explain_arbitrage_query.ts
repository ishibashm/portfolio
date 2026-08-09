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
  municipalityStatsSql,
  selectSql,
  statsSql,
} from "../src/utils/arbitrageQuery";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

const PREFECTURE = process.env.EXPLAIN_PREFECTURE || "all";
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

async function main() {
  // 他のスクリプト（purge / build_area_dataset）と同じ作り方。
  // SSL は接続文字列の sslmode に任せる。
  const pool = new Pool({ connectionString, max: 1 });

  const { sql: whereSql, params } = buildWhereSql({
    maxSeenDays: MAX_SEEN_DAYS,
    maxBuildingAge: null,
    radiusKm: 0,
    baseLat: NaN,
    baseLon: NaN,
    minLat: NaN,
    maxLat: NaN,
    minLon: NaN,
    maxLon: NaN,
    prefecture: PREFECTURE,
  });

  console.log(`対象: prefecture=${PREFECTURE} / maxSeenDays=${MAX_SEEN_DAYS}`);
  console.log(`1 本あたりの上限: ${TIMEOUT_MS} ms`);

  await pool.query(`SET statement_timeout = ${TIMEOUT_MS}`);

  await explain(
    pool,
    "1. 候補の取り出し selectSql",
    selectSql(whereSql, DEDUPE, params.length + 1, "value"),
    [...params, LIMIT],
  );
  await explain(
    pool,
    "3. 鮮度 max(last_seen_at)（条件なし）",
    "SELECT max(last_seen_at) FROM rental_properties",
    [],
  );
  await explain(
    pool,
    "4. 相場の基準値 statsSql",
    statsSql(whereSql, DEDUPE),
    params,
  );
  await explain(
    pool,
    "5. 市区町村ごとの中央値 municipalityStatsSql",
    municipalityStatsSql(whereSql, DEDUPE),
    params,
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
