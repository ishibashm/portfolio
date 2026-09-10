import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { toLogMessage } from "../src/lib/errorMessage";
import { geocodeAddress, geocodeStats, preloadTownCache } from "./geocodeGsi";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 売地（land_listings）の座標を埋める。
 *
 * 取り込み（nifty_land_extractor.ts）は住所しか持たない。**座標が無い行は
 * 地図に 1 件も出ない**ので、賃貸の geocode と同じことを売地にもやる。
 *
 * 住所 → 座標の引き方とキャッシュは `geocodeGsi.ts`（賃貸と共通）。
 * 町丁目の永続キャッシュ（geocode_towns）を共有するので、**賃貸の掲載が
 * ある町丁目には国土地理院へ行かない。**新規の要求は売地にしか無い
 * 町丁目のぶんだけになる。
 *
 *   LAND_GEOCODE_TIME_BUDGET_MIN  分。超えたら書き戻して正常終了する
 *   LAND_GEOCODE_BATCH            1 度に読む行数（既定 500）
 */

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const TIME_BUDGET_MS =
  (parseInt(process.env.LAND_GEOCODE_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();
const BATCH = parseInt(process.env.LAND_GEOCODE_BATCH || "500", 10) || 500;

function timeBudgetReached(): boolean {
  return TIME_BUDGET_MS > 0 && Date.now() - STARTED_AT >= TIME_BUDGET_MS;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  /* 1 行ずつ UPDATE すると往復待ちが仕事の大半になる（賃貸で実測 60 分中
     47 分）。まとめて書き戻す */
  const pending: { id: string; lat: number; lon: number }[] = [];

  async function flush() {
    if (pending.length === 0) return;
    await pool.query(
      `UPDATE land_listings l
          SET lat = v.lat, lon = v.lon
         FROM (SELECT unnest($1::uuid[])   AS id,
                      unnest($2::float8[]) AS lat,
                      unnest($3::float8[]) AS lon) v
        WHERE l.id = v.id`,
      [
        pending.map((r) => r.id),
        pending.map((r) => r.lat),
        pending.map((r) => r.lon),
      ],
    );
    pending.length = 0;
  }

  let totalOk = 0;
  let totalNg = 0;
  try {
    await preloadTownCache(pool);

    /* 同じ住所の行に、既に座標を持つ行からコピーする。売地は同じ土地が
       出どころ違いで複数行入るので、ここだけでかなり埋まる。**国土地理院へは
       1 度も行かない。** */
    const copied = await pool.query(
      `UPDATE land_listings t
          SET lat = s.lat, lon = s.lon
         FROM (SELECT DISTINCT ON (address) address, lat, lon
                 FROM land_listings
                WHERE lat IS NOT NULL AND address IS NOT NULL) s
        WHERE t.address = s.address AND t.lat IS NULL`,
    );
    console.log(`同じ住所からコピー: ${copied.rowCount ?? 0} 行`);

    while (!timeBudgetReached()) {
      const rows = await pool.query<{ id: string; address: string | null }>(
        `SELECT id, address FROM land_listings
          WHERE lat IS NULL AND address IS NOT NULL
          LIMIT $1`,
        [BATCH],
      );
      if (rows.rowCount === 0) {
        console.log("🎉 座標の無い売地はもう無い。");
        break;
      }
      console.log(`🚀 ${rows.rowCount} 行を引く`);

      let ok = 0;
      let ng = 0;
      for (const row of rows.rows) {
        if (timeBudgetReached()) break;
        if (!row.address) continue;
        const result = await geocodeAddress(pool, row.address);
        if (result.kind === "ok") {
          pending.push({
            id: row.id,
            lat: result.point.lat,
            lon: result.point.lon,
          });
          ok++;
        } else {
          /* 引けなかった行は lat を NULL のまま残す。**次の実行でまた出る**
             ので、一時的な失敗なら勝手に直る。not_found はキャッシュ側が
             30 日で期限切れにする */
          console.log(
            result.kind === "not_found"
              ? `❌ [見つからない] ${row.address}`
              : `⚠️ [引けなかった] ${row.address}`,
          );
          ng++;
        }
      }
      await flush();
      totalOk += ok;
      totalNg += ng;
      console.log(`  埋めた ${ok} / 引けなかった ${ng}`);

      /* このバッチが全部失敗なら、次を読んでも同じ行が出るだけで無限に回る */
      if (ok === 0) break;
    }

    await flush();
    const stats = geocodeStats();
    console.log(
      `合計: 埋めた ${totalOk} / 引けなかった ${totalNg} / ` +
        `キャッシュ ${stats.towns} 町丁目（この実行で国土地理院へ ${stats.gsiCalls} 回）`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("落ちた:", toLogMessage(e));
  process.exit(1);
});
