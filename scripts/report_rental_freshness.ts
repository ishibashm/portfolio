/**
 * scrape-rentals ワークフローの最後に実行し、
 * 「実際にデータが新しくなったか」をジョブログとサマリーで確認できるようにする。
 * ログを読まないと更新できていないことに気付けない、という状態を避けるためのもの。
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

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const { rows } = await pool.query<{
      total: string;
      with_latlon: string;
      seen_24h: string;
      seen_7d: string;
      newest: Date | null;
    }>(`
      SELECT
        count(*)                                                        AS total,
        count(lat)                                                      AS with_latlon,
        count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours') AS seen_24h,
        count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')   AS seen_7d,
        max(last_seen_at)                                               AS newest
      FROM rental_properties
    `);

    const r = rows[0];
    const lines = [
      "### Rental listings freshness",
      "",
      "| Metric | Value |",
      "| --- | --- |",
      `| Total rows | ${r.total} |`,
      `| With coordinates | ${r.with_latlon} |`,
      `| Seen in last 24h | ${r.seen_24h} |`,
      `| Seen in last 7d | ${r.seen_7d} |`,
      `| Newest last_seen_at | ${r.newest ? r.newest.toISOString() : "n/a"} |`,
    ];

    // 容量の逼迫に気付けるのはここだけなので、毎回サイズを出しておく。
    //
    // 上限は接続先で変わる。Supabase Free は 500MB を超えると強制的に
    // リードオンリーへ落ちるが、自前の Postgres ではディスクが尽きるまでが上限で、
    // 桁がまるで違う。500 を決め打ちしたままだと「47%」のような無意味な警告を
    // 出し続けることになるので、ホストで判定し、DB_SIZE_LIMIT_MB で上書きできる
    // ようにする。分からないときは割合を出さない（嘘の分母を置かない）。
    const dbHost = (() => {
      try {
        return new URL(connectionString!).hostname;
      } catch {
        return "";
      }
    })();
    const supabaseLimitMb = /(^|\.)supabase\.(co|com)$/.test(dbHost) ? 500 : 0;
    const limitMb = Number(process.env.DB_SIZE_LIMIT_MB) || supabaseLimitMb;

    const { rows: sizeRows } = await pool.query<{ mb: string }>(
      `SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0) AS mb`,
    );
    const usedMb = Number(sizeRows[0].mb);

    if (limitMb > 0) {
      const usedPct = Math.round((usedMb / limitMb) * 100);
      lines.push(`| Database size | ${usedMb} MB / ${limitMb} MB (${usedPct}%) |`);
      if (usedPct >= 80) {
        console.log(
          `::warning::Database is at ${usedPct}% of the ${limitMb} MB limit.`,
        );
      }
    } else {
      lines.push(`| Database size | ${usedMb} MB |`);
      lines.push(
        "| Size limit | 未設定（DB_SIZE_LIMIT_MB で指定すると割合と警告が出る） |",
      );
    }

    // 500MB を超えたときに「何を削れば効くのか」がこの数字だけでは決められない。
    // 掲載終了で消せる分・座標が付かず検索に出ない分・同一部屋の重複で
    // 増えている分を切り分ける。行数の内訳と、実体・索引の別を出す。
    const breakdown = await pool.query<{
      expired: string;
      no_coords: string;
      stale_45d: string;
      rooms: string;
      table_mb: string;
      index_mb: string;
    }>(`
      SELECT
        (SELECT count(*) FROM rental_properties
          WHERE expire_date IS NOT NULL AND expire_date < now())        AS expired,
        (SELECT count(*) FROM rental_properties WHERE lat IS NULL)      AS no_coords,
        (SELECT count(*) FROM rental_properties
          WHERE last_seen_at < now() - interval '45 days')              AS stale_45d,
        -- 名寄せ後の実部屋数。物件名・階・間取り・面積・賃料が同じものは
        -- 同じ部屋を複数の仲介が出しているとみなす（スキャナー側と同じ考え方）。
        (SELECT count(*) FROM (
           SELECT 1 FROM rental_properties
            GROUP BY property_name, floor, layout, size_sqm, rent
         ) AS d)                                                        AS rooms,
        round(pg_relation_size('rental_properties') / 1024.0 / 1024.0)  AS table_mb,
        round(pg_indexes_size('rental_properties') / 1024.0 / 1024.0)   AS index_mb
    `);
    const b = breakdown.rows[0];
    const total = Number(r.total);
    const pct = (n: string) =>
      total > 0 ? `${Math.round((Number(n) / total) * 100)}%` : "-";

    lines.push(
      "",
      "#### What is taking the space",
      "",
      "| Item | Rows | Share |",
      "| --- | --- | --- |",
      `| Past listing expiry (deletable) | ${b.expired} | ${pct(b.expired)} |`,
      `| Not seen for 45+ days (deletable) | ${b.stale_45d} | ${pct(b.stale_45d)} |`,
      `| No coordinates (invisible in search) | ${b.no_coords} | ${pct(b.no_coords)} |`,
      `| Distinct rooms after dedupe | ${b.rooms} | ${pct(b.rooms)} |`,
      "",
      `Table ${b.table_mb} MB / indexes ${b.index_mb} MB`,
    );

    // 12 県を matrix で並列に回しているので、どの県まで行き渡っているかを県別にも出す。
    const byPref = await pool.query<{
      pref: string;
      cnt: string;
      geo: string;
      newest: Date | null;
    }>(`
      SELECT
        substring(address from 1 for 3) AS pref,
        count(*)                        AS cnt,
        count(lat)                      AS geo,
        max(last_seen_at)               AS newest
      FROM rental_properties
      WHERE address IS NOT NULL AND address <> ''
      GROUP BY 1
      ORDER BY max(last_seen_at) DESC NULLS LAST
      LIMIT 20
    `);

    lines.push(
      "",
      "#### By prefecture",
      "",
      "| Prefecture | Rows | With coords | Last seen |",
      "| --- | --- | --- | --- |",
      ...byPref.rows.map(
        (p) =>
          `| ${p.pref} | ${p.cnt} | ${p.geo} | ${p.newest ? p.newest.toISOString().slice(0, 16).replace("T", " ") : "n/a"} |`,
      ),
    );

    console.log(lines.join("\n"));

    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        lines.join("\n") + "\n",
      );
    }

    if (Number(r.seen_24h) === 0) {
      // upsert が 1 件も走っていない＝スクレイパーが実質的に何もしていない。
      // ジョブは緑のまま終わってしまうので、ここで明示的に落とす。
      console.error(
        "::error::No listing was refreshed in the last 24h. The scraper produced nothing.",
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
