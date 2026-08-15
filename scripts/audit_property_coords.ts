import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

/**
 * 物件の座標が、住所の指す場所からどれだけ外れているかを数える。**読み取りだけ。**
 *
 * 利用者から「物件の場所と地図の場所が合っていないものがちらほらある」と
 * 報告を受けた。座標は scripts/geocode_properties.ts が国土地理院の
 * 住所検索（GSI AddressSearch）から取っているが、
 *
 *   - 返ってきた点が **本当に住所の都道府県・市区町村の中にあるか** を
 *     一度も確かめていない。json[0] をそのまま採用している
 *   - normalize() が失敗した住所は、番地や建物名の付いた生の文字列で
 *     引いている。曖昧な問い合わせほど、遠くの同名地に当たりやすい
 *
 * ので、取り違えが混ざっていても誰も気付けない作りになっている。
 * 推測で直す前に、実データで「何件が、どれだけ外れているか」を測る。
 *
 * 測り方は住所の市区町村（municipality_key）ごとの**中央値**からの距離。
 * 平均だと外れ値自身に引きずられる。中央値なら、その市の物件の大半が
 * 集まっている場所が基準になる。
 *
 * 使い方（GitHub Actions の db-audit-coords.yml から回す）:
 *   npx tsx scripts/audit_property_coords.ts
 *
 * 環境変数
 *   COORD_AUDIT_KM       これを超えたら「外れ」とみなす距離。既定 30
 *   COORD_AUDIT_SAMPLES  一覧に出す件数。既定 40
 */

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const THRESHOLD_KM = Number(process.env.COORD_AUDIT_KM || "30");
const SAMPLE_LIMIT = Number(process.env.COORD_AUDIT_SAMPLES || "40");

/**
 * 住所の頭の都道府県名。address は「兵庫県神戸市…」の形で入っている
 * （スキャナーの絞り込みも address LIKE '兵庫県%' の前方一致）。
 */
const PREF_SQL = `substring(address from '^(.{2,3}?[都道府県])')`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  try {
    const total = await pool.query<{ n: string; with_coords: string }>(
      `SELECT count(*)::text AS n,
              count(lat)::text AS with_coords
         FROM rental_properties`,
    );
    console.log(
      `対象: ${total.rows[0].n} 行（うち座標あり ${total.rows[0].with_coords} 行）\n`,
    );

    /*
      市区町村ごとの中央値からの距離。距離は緯度経度の差を km に直した
      近似（緯度 1 度 ≒ 111km、経度は cos(緯度) 倍）。国内の 30km 判定に
      使うだけなので、測地線を厳密に解く必要はない。
    */
    const distanceCte = `
      WITH located AS (
        SELECT id, property_name, address, lat, lon, municipality_key,
               ${PREF_SQL} AS pref
          FROM rental_properties
         WHERE lat IS NOT NULL AND lon IS NOT NULL
           AND municipality_key IS NOT NULL
      ),
      centers AS (
        SELECT municipality_key,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) AS c_lat,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY lon) AS c_lon,
               count(*) AS n
          FROM located
         GROUP BY municipality_key
      ),
      dist AS (
        SELECT l.*, c.c_lat, c.c_lon, c.n AS peers,
               sqrt(
                 power((l.lat - c.c_lat) * 111.0, 2) +
                 power((l.lon - c.c_lon) * 111.0 * cos(radians(l.lat)), 2)
               ) AS km
          FROM located l
          JOIN centers c ON c.municipality_key = l.municipality_key
         WHERE c.n >= 5
      )`;

    const buckets = await pool.query<{ bucket: string; n: string }>(
      `${distanceCte}
       SELECT CASE
                WHEN km < 5   THEN '  0-5km'
                WHEN km < 15  THEN ' 5-15km'
                WHEN km < 30  THEN '15-30km'
                WHEN km < 100 THEN '30-100km'
                ELSE          '100km 超'
              END AS bucket,
              count(*)::text AS n
         FROM dist
        GROUP BY 1
        ORDER BY 1`,
    );
    console.log("■ 住所の市区町村の中央値からの距離");
    for (const r of buckets.rows) {
      console.log(`  ${r.bucket.padEnd(10)} ${r.n.padStart(9)} 件`);
    }

    const outliers = await pool.query<{ n: string }>(
      `${distanceCte}
       SELECT count(*)::text AS n FROM dist WHERE km >= $1`,
      [THRESHOLD_KM],
    );
    console.log(`\n■ ${THRESHOLD_KM}km 以上外れ: ${outliers.rows[0].n} 件`);

    const byPref = await pool.query<{ pref: string; n: string; tot: string }>(
      `${distanceCte}
       SELECT coalesce(pref, '(不明)') AS pref,
              count(*) FILTER (WHERE km >= $1)::text AS n,
              count(*)::text AS tot
         FROM dist
        GROUP BY 1
       HAVING count(*) FILTER (WHERE km >= $1) > 0
        ORDER BY count(*) FILTER (WHERE km >= $1) DESC
        LIMIT 15`,
      [THRESHOLD_KM],
    );
    if (byPref.rows.length > 0) {
      console.log("\n■ 都道府県別（外れ / その県の座標あり件数）");
      for (const r of byPref.rows) {
        console.log(`  ${r.pref.padEnd(6)} ${r.n.padStart(7)} / ${r.tot}`);
      }
    }

    const samples = await pool.query<{
      property_name: string;
      address: string;
      lat: number;
      lon: number;
      c_lat: number;
      c_lon: number;
      km: number;
      peers: string;
    }>(
      `${distanceCte}
       SELECT property_name, address, lat, lon, c_lat, c_lon, km,
              peers::text AS peers
         FROM dist
        WHERE km >= $1
        ORDER BY km DESC
        LIMIT $2`,
      [THRESHOLD_KM, SAMPLE_LIMIT],
    );
    if (samples.rows.length > 0) {
      console.log(`\n■ 外れの実例（遠い順・最大 ${SAMPLE_LIMIT} 件）`);
      for (const r of samples.rows) {
        console.log(
          `  ${Math.round(r.km).toString().padStart(5)}km  ${r.address}\n` +
            `         ${r.property_name}\n` +
            `         実座標 ${r.lat.toFixed(4)},${r.lon.toFixed(4)}` +
            ` / その市の中央値 ${r.c_lat.toFixed(4)},${r.c_lon.toFixed(4)}` +
            `（${r.peers} 件）`,
        );
      }
    }

    /*
      同じ座標を大量の行が共有していないか。ジオコーディングは町丁目単位
      なので十数件が同じ点に並ぶのは正常だが、桁違いの塊は「市の代表点に
      落ちた」しるしで、その市の物件が全部同じ方位・同じ距離になる。
    */
    const clusters = await pool.query<{
      lat: number;
      lon: number;
      n: string;
      sample: string;
    }>(
      `SELECT lat, lon, count(*)::text AS n,
              (array_agg(address ORDER BY address))[1] AS sample
         FROM rental_properties
        WHERE lat IS NOT NULL
        GROUP BY lat, lon
       HAVING count(*) >= 200
        ORDER BY count(*) DESC
        LIMIT 15`,
    );
    console.log("\n■ 同一座標に 200 件以上が固まっている点");
    if (clusters.rows.length === 0) {
      console.log("  なし");
    } else {
      for (const r of clusters.rows) {
        console.log(
          `  ${r.n.padStart(7)} 件  ${r.lat.toFixed(4)},${r.lon.toFixed(4)}  例: ${r.sample}`,
        );
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
