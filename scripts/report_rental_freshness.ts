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
