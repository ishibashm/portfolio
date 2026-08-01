/**
 * rental_properties を Supabase Free プラン（500MB でリードオンリー）に収め続けるための削除処理。
 *
 * スクレイパーは upsert しかしないため、掲載終了した物件も行として残り続ける。
 * 在庫は入れ替わるのに行数は増える一方なので、放置すると必ず上限に当たる。
 *
 * 3 つのルールで削る:
 *   1. 対象都道府県から外れた行 — もう更新されないので保持する意味がない
 *   2. 一定期間 last_seen_at が更新されていない行 — 掲載終了とみなす
 *   3. 掲載期限(expire_date)を過ぎた行 — 詳細ページが 404 になる。2 より確実
 *
 * 既定はドライラン。実際に削除するには PURGE_APPLY=true が必要。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

// nifty_extractor.ts の対象都道府県に対応する日本語表記。
// DB 側は住所文字列しか持たないため、ローマ字キーとは別にここで持つ必要がある。
const TARGET_PREFECTURES = [
  "愛知県",
  "静岡県",
  "三重県",
  "福井県",
  "滋賀県",
  "京都府",
  "大阪府",
  "奈良県",
  "兵庫県",
  "鳥取県",
  "島根県",
  "広島県",
];

const APPLY = process.env.PURGE_APPLY === "true";
// 全件スイープは 1 県を回るのに数日かかる。短すぎると生きている物件を消すので、
// 掲載終了と断定できる長さに取る。
const STALE_DAYS = parseInt(process.env.PURGE_STALE_DAYS || "90", 10);

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  const q = async (sql: string, params: any[] = []) =>
    (await pool.query(sql, params)).rows;

  try {
    const sizeBefore = (
      await q(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS s`,
      )
    )[0].s;
    console.log(`Database size before: ${sizeBefore}`);
    console.log(`Mode: ${APPLY ? "APPLY (rows will be deleted)" : "DRY RUN"}`);
    console.log(`Stale threshold: ${STALE_DAYS} days`);
    console.log(`Target prefectures: ${TARGET_PREFECTURES.join(" ")}`);

    const outOfScopeWhere = `substring(address from 1 for 3) <> ALL($1::text[])`;
    const staleWhere = `last_seen_at < now() - ($1::int * interval '1 day')`;

    const outOfScope = await q(
      `SELECT substring(address from 1 for 3) AS pref, count(*) AS rows
         FROM rental_properties
        WHERE ${outOfScopeWhere}
        GROUP BY 1 ORDER BY 2 DESC`,
      [TARGET_PREFECTURES],
    );
    const staleCount = (
      await q(
        `SELECT count(*) AS rows FROM rental_properties WHERE ${staleWhere}`,
        [STALE_DAYS],
      )
    )[0].rows;
    // 掲載期限を過ぎた物件は詳細ページが 404 になる。last_seen_at より確実な廃止判定。
    const expiredCount = (
      await q(
        `SELECT count(*) AS rows FROM rental_properties
          WHERE expire_date IS NOT NULL AND expire_date < now()`,
      )
    )[0].rows;

    const outOfScopeTotal = outOfScope.reduce(
      (a: number, r: any) => a + Number(r.rows),
      0,
    );

    console.log("\n[1] Out-of-scope prefectures");
    if (outOfScope.length === 0) {
      console.log("    nothing to remove");
    } else {
      for (const r of outOfScope) console.log(`    ${r.pref}: ${r.rows}`);
      console.log(`    total: ${outOfScopeTotal}`);
    }
    console.log(`\n[2] Not seen for ${STALE_DAYS}+ days: ${staleCount}`);
    console.log(`[3] Past their listing expiry: ${expiredCount}`);

    if (!APPLY) {
      console.log("\nDry run. Set PURGE_APPLY=true to delete.");
      return;
    }

    // 2 つの条件をまとめて 1 文で消す。件数は rowCount で受ける
    // （RETURNING で受けると 10 万行をクライアントに載せることになる）。
    const del = await pool.query(
      `DELETE FROM rental_properties
        WHERE substring(address from 1 for 3) <> ALL($1::text[])
           OR last_seen_at < now() - ($2::int * interval '1 day')
           OR (expire_date IS NOT NULL AND expire_date < now())`,
      [TARGET_PREFECTURES, STALE_DAYS],
    );
    const deleted = del.rowCount ?? 0;
    console.log(`\nDeleted ${deleted} rows.`);

    // DELETE だけでは領域が OS に返らず pg_database_size も縮まない。
    // Supabase の 500MB クォータはこのサイズで判定されるため VACUUM FULL が要る。
    console.log("Running VACUUM FULL to reclaim the space...");
    await pool.query("VACUUM (FULL, ANALYZE) rental_properties");

    const sizeAfter = (
      await q(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS s`,
      )
    )[0].s;
    const remaining = (
      await q(`SELECT count(*) AS rows FROM rental_properties`)
    )[0].rows;
    console.log(`Database size after: ${sizeAfter} (${remaining} rows remain)`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Purge\n\n- Deleted: ${deleted} rows\n- Database size: ${sizeBefore} → ${sizeAfter}\n- Remaining: ${remaining} rows\n`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
