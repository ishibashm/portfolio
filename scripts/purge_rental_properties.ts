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

import {
  TARGET_PREFECTURE_NAMES,
  TARGET_PREFECTURE_LIKE,
} from "../src/lib/scrapeTargets";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

// 対象都道府県の日本語表記。DB 側は住所文字列しか持たないため、
// ローマ字スラッグとは別に日本語名で突き合わせる。
//
// ここがスクレイパーの対象より狭いと、取り込んだ行を同じ晩に「範囲外」として
// 削除してしまう。両方を src/lib/scrapeTargets.ts から引いてずれを防ぐ。
const TARGET_PREFECTURES = [...TARGET_PREFECTURE_NAMES];

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

    // 範囲内かどうかは前方一致で見る。**固定長で切って比べないこと。**
    //
    // ここは `substring(address from 1 for 3) <> ALL(県名の配列)` だった。
    // 47 都道府県のうち 3 文字でないのはちょうど 3 つ（神奈川県・和歌山県・
    // 鹿児島県。いずれも 4 文字）で、住所を 3 文字に切ると県名と一致しない。
    // その 3 県だけが対象リストに入っているのに毎晩「範囲外」として削除され、
    // データが永久に 0 件だった。巡回自体は毎日走っているので、取っては
    // 消すのを繰り返していた（2026-08-12 の実測で 1 晩に 49,069 行、
    // 神奈川だけで 160 分ぶんの巡回が捨てられていた）。
    const outOfScopeWhere = `NOT (address LIKE ANY ($1::text[]))`;
    const staleWhere = `last_seen_at < now() - ($1::int * interval '1 day')`;

    // 報告は 4 文字で切る。3 文字だと「神奈川」と出て、県名と読み比べても
    // なぜ範囲外なのか分からない（実際そう出ていた）。
    const outOfScope = await q(
      `SELECT substring(address from 1 for 4) AS pref, count(*) AS rows
         FROM rental_properties
        WHERE ${outOfScopeWhere}
        GROUP BY 1 ORDER BY 2 DESC`,
      [TARGET_PREFECTURE_LIKE],
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
        WHERE NOT (address LIKE ANY ($1::text[]))
           OR last_seen_at < now() - ($2::int * interval '1 day')
           OR (expire_date IS NOT NULL AND expire_date < now())`,
      [TARGET_PREFECTURE_LIKE, STALE_DAYS],
    );
    const deleted = del.rowCount ?? 0;
    console.log(`\nDeleted ${deleted} rows.`);

    // 領域の回収。**既定では VACUUM FULL を打たない。**
    //
    // ここは無条件に VACUUM (FULL, ANALYZE) を打っていた。理由は
    // 「DELETE だけでは領域が OS に返らず、Supabase の 500MB クォータは
    // pg_database_size で判定されるため」。**その前提はもう無い。**
    // 移行先の Oracle Cloud Always Free は 200GB あり、いまの DB は
    // 数百MB。毎晩スペースを OS へ返す必要が無くなっている。
    //
    // 一方で代償は残ったままだった。VACUUM FULL は対象テーブルに
    // ACCESS EXCLUSIVE ロックを取る。掛かっているあいだ
    // rental_properties は**読むこともできない**ので、物件スキャナーの
    // 走査はロック待ちで止まる。dbcapacity 側のコメントが
    // 「scrape-rentals が走っている最中に重ねないこと」と書いているのに、
    // その scrape-rentals 自身が毎晩打っていた。
    //
    // 通常の VACUUM は領域を OS へ返さないが、消した分を同じテーブルの
    // 再利用に回すので肥大は止まる。取得と削除が毎晩釣り合っている限り
    // これで足りる。ロックも取らない（読み書きと同時に走る）。
    //
    // FULL が要るのは、消した量が大きくて実際に縮めたいときだけ。
    // 判断は容量で決める。手で打ちたいときは PURGE_VACUUM_FULL=true。
    const sizeMb = Number(
      (
        await q(
          `SELECT (pg_total_relation_size('rental_properties') / 1024 / 1024)::int AS mb`,
        )
      )[0].mb,
    );
    const fullThresholdMb = parseInt(
      process.env.PURGE_VACUUM_FULL_OVER_MB || "4096",
      10,
    );
    const wantFull =
      process.env.PURGE_VACUUM_FULL === "true" || sizeMb >= fullThresholdMb;

    if (wantFull) {
      console.log(
        `Running VACUUM FULL (table ${sizeMb}MB >= ${fullThresholdMb}MB or forced). ` +
          "This locks rental_properties for reads and writes.",
      );
      await pool.query("VACUUM (FULL, ANALYZE) rental_properties");
    } else {
      console.log(
        `Running plain VACUUM ANALYZE (table ${sizeMb}MB < ${fullThresholdMb}MB). ` +
          "No exclusive lock; the scanner keeps working.",
      );
      await pool.query("VACUUM (ANALYZE) rental_properties");
    }

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
