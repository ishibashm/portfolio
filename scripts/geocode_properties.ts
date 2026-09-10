import { Pool } from "pg";
import { geocodeAddress, geocodeStats, preloadTownCache } from "./geocodeGsi";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Please ensure your .env file exists and contains DATABASE_URL.",
  );
}

// スクレイパーと同様、CI のジョブ上限に収めるための自発停止。
// 未処理分は次回の実行で拾われる（lat/lon が NULL の行を毎回探すため）。
const TIME_BUDGET_MS =
  (parseInt(process.env.GEOCODE_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();

// level を検証していなかった時期に市の代表点を割り当てられた行をやり直すモード。
const REFRESH_CLUSTERED = process.env.GEOCODE_REFRESH_CLUSTERED === "true";
// 同一座標を何件が共有していたら「粗すぎる」とみなすか。
// 丁目単位なら同じ点に十数件並ぶのは自然なので、明らかに市単位の塊だけを狙う。
const CLUSTER_MIN = parseInt(process.env.GEOCODE_CLUSTER_MIN || "50", 10);

function timeBudgetReached(): boolean {
  return TIME_BUDGET_MS > 0 && Date.now() - STARTED_AT >= TIME_BUDGET_MS;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // 実測では 60 分の実行のうち約 47 分が 1 行ずつの UPDATE の往復待ちだった
  // （Actions ランナー → DB が 1 回 150ms 強）。座標はまとめて書き戻す。
  const pendingOk: { id: string; lat: number; lon: number }[] = [];
  const pendingClear: string[] = [];

  async function flush() {
    if (pendingOk.length > 0) {
      await pool.query(
        `UPDATE rental_properties p
            SET lat = v.lat, lon = v.lon
           FROM (SELECT unnest($1::uuid[])   AS id,
                        unnest($2::float8[]) AS lat,
                        unnest($3::float8[]) AS lon) v
          WHERE p.id = v.id`,
        [
          pendingOk.map((r) => r.id),
          pendingOk.map((r) => r.lat),
          pendingOk.map((r) => r.lon),
        ],
      );
      pendingOk.length = 0;
    }
    if (pendingClear.length > 0) {
      await pool.query(
        `UPDATE rental_properties SET lat = NULL, lon = NULL
          WHERE id = ANY($1::uuid[])`,
        [pendingClear],
      );
      pendingClear.length = 0;
    }
  }

  try {
    // 同一住所の座標コピーが大きい UPDATE になる。Supabase の既定 120 秒だと
    // 打ち切られうるので解除する。権限が無ければ既定のまま続行する。
    try {
      await pool.query("SET statement_timeout = 0");
    } catch {
      /* noop */
    }

    await preloadTownCache(pool);

    if (!REFRESH_CLUSTERED) {
      // 座標は町丁目単位なので、同じ住所の行は必ず同じ座標になる。
      // 既に座標を持つ行から同一住所へコピーすれば、APIを一度も叩かずに埋まる。
      // 同じ建物の別の部屋がこれに当たるため、対象はかなり多い。
      //
      // コピー元から「市の代表点の塊」は除く。粗い座標を増やすと、
      // やり直しモード（REFRESH_CLUSTERED）の仕事を増やすだけになる。
      const propagated = await pool.query(
        `WITH clustered AS (
           SELECT lat, lon
             FROM rental_properties
            WHERE lat IS NOT NULL
            GROUP BY lat, lon
           HAVING count(*) >= $1
         ),
         good AS (
           SELECT DISTINCT ON (p.address) p.address, p.lat, p.lon
             FROM rental_properties p
             LEFT JOIN clustered c ON c.lat = p.lat AND c.lon = p.lon
            WHERE p.lat IS NOT NULL
              AND p.address IS NOT NULL AND p.address <> ''
              AND c.lat IS NULL
            ORDER BY p.address, p.last_seen_at DESC NULLS LAST
         )
         UPDATE rental_properties t
            SET lat = g.lat, lon = g.lon
           FROM good g
          WHERE t.lat IS NULL
            AND t.address = g.address`,
        [CLUSTER_MIN],
      );
      console.log(
        `📋 Copied coordinates to ${propagated.rowCount ?? 0} rows that share an already-geocoded address.`,
      );
    }

    let totalSuccess = 0;
    let totalFail = 0;
    let batchNumber = 1;
    // id カーソルで前進させる。「まだ座標が無い行」を毎回先頭から取り直すと、
    // 見つからなかった住所（NULL のまま残る）が先頭に居座り、同じ 1000 件を
    // 延々と読み直して前に進まなくなる。id 順なら必ず前進し、
    // 取りこぼしは次回の実行が拾う。
    let cursor = "00000000-0000-0000-0000-000000000000";

    while (true) {
      if (timeBudgetReached()) {
        console.log(
          "\n⏱️ Time budget reached. Remaining addresses will be geocoded on the next run.",
        );
        break;
      }

      // 通常は「まだ座標が無い物件」を処理する。
      // REFRESH_CLUSTERED のときは、level を見ていなかった頃に市の代表点を
      // 割り当てられてしまった物件（同一座標を大量に共有している行）をやり直す。
      // 精度が出れば別の座標に散り、出なければ NULL に落ちるので、
      // どちらにせよクラスタから抜けて必ず前進する。
      const unmapped = REFRESH_CLUSTERED
        ? await pool.query<{ id: string; address: string | null }>(
            `WITH clustered AS (
               SELECT lat, lon
                 FROM rental_properties
                WHERE lat IS NOT NULL
                GROUP BY lat, lon
               HAVING count(*) >= $1
             )
             SELECT p.id, p.address
               FROM rental_properties p
               JOIN clustered c ON p.lat = c.lat AND p.lon = c.lon
              WHERE p.address IS NOT NULL AND p.address <> ''
                AND p.id > $2::uuid
              ORDER BY p.id
              LIMIT 1000`,
            [CLUSTER_MIN, cursor],
          )
        : await pool.query<{ id: string; address: string | null }>(
            `SELECT id, address
               FROM rental_properties
              WHERE lat IS NULL
                AND address IS NOT NULL AND address <> ''
                AND id > $1::uuid
              ORDER BY id
              LIMIT 1000`,
            [cursor],
          );
      const unmappedProperties = unmapped.rows;

      if (unmappedProperties.length === 0) {
        console.log(`\n🎉 No more properties left to geocode. All done!`);
        break;
      }

      console.log(`\n======================================================`);
      console.log(
        `🚀 Batch #${batchNumber}: Found ${unmappedProperties.length} properties to geocode.`,
      );
      console.log(`======================================================\n`);

      let batchSuccessCount = 0;
      let batchFailCount = 0;

      for (const prop of unmappedProperties) {
        if (timeBudgetReached()) break;
        cursor = prop.id;
        if (!prop.address) continue;

        const result = await geocodeAddress(pool, prop.address);

        if (result.kind === "ok") {
          pendingOk.push({
            id: prop.id,
            lat: result.point.lat,
            lon: result.point.lon,
          });
          batchSuccessCount++;
          totalSuccess++;
        } else if (result.kind === "not_found") {
          // やり直しモードでは、粗すぎる座標を残してはいけない。
          // 市の代表点のままだと方位も距離も誤ったまま画面に出てしまうので、
          // 「座標なし（＝スキャナーに出さない）」に落とすほうが正しい。
          // ネットワークエラー(kind === "error")では消さない。
          // 一時的な障害で全件の座標を消してしまうのを避けるため。
          if (REFRESH_CLUSTERED) {
            pendingClear.push(prop.id);
          }
          console.log(`❌ [Not found] ${prop.address}`);
          batchFailCount++;
          totalFail++;
        } else {
          console.log(`⚠️ [Lookup error, left as-is] ${prop.address}`);
          batchFailCount++;
          totalFail++;
        }
      }

      // 時間切れで抜けた場合も、ここまでの結果は必ず書き戻す。
      await flush();

      console.log(`\n📊 Batch #${batchNumber} Results:`);
      console.log(`   - Successfully updated: ${batchSuccessCount}`);
      console.log(`   - Failed to locate: ${batchFailCount}`);
      console.log(
        `   - Town cache: ${geocodeStats().towns} entries / ${geocodeStats().gsiCalls} lookups`,
      );

      batchNumber++;
    }

    await flush();

    console.log(`\n======================================================`);
    console.log(`🏆 Final Geocoding Results (GSI address search):`);
    console.log(`   - Total successfully updated: ${totalSuccess}`);
    console.log(`   - Total failed to locate: ${totalFail}`);
    console.log(
      `   - Towns in cache: ${geocodeStats().towns} (${geocodeStats().gsiCalls} GSI requests this run)`,
    );
    console.log(`======================================================\n`);
  } catch (e) {
    console.error("Fatal error during geocoding:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
