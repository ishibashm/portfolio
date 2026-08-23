import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });
const localEnvPath = envPath + ".local";
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

import { PrismaClient } from "@prisma/client";
import { toLandPricePoint, type LandPricePoint } from "./landPriceParse";
import { toLogMessage } from "../src/lib/errorMessage";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Please ensure your .env file exists and contains DATABASE_URL.",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/*
  APIキーは環境変数から取得。

  以前は const API_KEY = process.env.LIBRARY_API_KEY のまま fetch へ
  渡していた。process.exit で抜けているので実行時は必ず入っているが、
  型の上では string | undefined のままで、fetch の headers に渡すと
  型が合わない。scripts/ は tsc の対象外なので誰も気付かなかった。
  受け直して string にする（キャストはしない）。
*/
const RAW_API_KEY = process.env.LIBRARY_API_KEY;
if (!RAW_API_KEY) {
  console.error("Error: LIBRARY_API_KEY environment variable is not set.");
  process.exit(1);
}
const API_KEY: string = RAW_API_KEY;

// 緯度経度からタイル座標(z, x, y)を計算する関数 (ズームレベル15固定)
function latLonToTile(lat: number, lon: number, zoom: number = 15) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return { z: zoom, x, y };
}

/*
  取得する年。以前は URL に 2023 が直に書いてあり、3 年前のまま
  動き続けていた。probe（run 32305342276）で 2025 が取れることを
  確認済み（target_year_name_ja = 「令和7年1月1日」）。
*/
const YEAR = process.env.LAND_PRICE_YEAR || "2025";

/**
 * タイル 1 枚ぶんの GeoJSON。
 *
 * 地点の形は `toLandPricePoint` が既に宣言しているので、そこから引く。
 * **同じ形を書き写さない**（CLAUDE.md 3 節）。
 */
type LandPriceFeature = Parameters<typeof toLandPricePoint>[0];
interface LandPriceTile {
  features?: LandPriceFeature[];
}

// タイルのキャッシュ
const tileCache: Record<string, LandPriceTile> = {};

/**
 * 集めた地点を land_price_points へ書く。
 *
 * 鍵は (point_id, year, land_price_type)。同じ年を二度取り込んでも
 * 更新になるだけで行は増えない。値が変わらなければ何も変わらない。
 *
 * 1 行ずつ往復すると全国で数万回になるので、配列を渡して
 * unnest で 1 文にする（成約価格の取り込みと同じ書き方）。
 */
async function saveLandPricePoints(points: Map<string, LandPricePoint>) {
  const rows = [...points.values()];
  if (rows.length === 0) {
    console.log("保存する地点が無い。");
    return;
  }

  const year = Number(YEAR);
  if (!Number.isFinite(year)) {
    console.error(`対象年が数値でない: ${YEAR}。地点は保存しない。`);
    return;
  }

  /*
    書き方は成約価格の取り込みに合わせる（pool.query + unnest）。
    1 行ずつ往復すると全国で数万回になる。created_at / updated_at は
    表側の DEFAULT now() に任せるので、列に並べない。
  */
  await pool.query(
    `INSERT INTO land_price_points
       (point_id, year, land_price_type, price_per_sqm,
        last_year_price_per_sqm, use_category, location,
        standard_lot_number, prefecture, municipality, lat, lon)
     SELECT * FROM unnest(
       $1::bigint[], $2::int[], $3::int[], $4::bigint[],
       $5::bigint[], $6::text[], $7::text[],
       $8::text[], $9::text[], $10::text[], $11::float8[], $12::float8[])
     ON CONFLICT (point_id, year, land_price_type) DO UPDATE SET
       price_per_sqm = EXCLUDED.price_per_sqm,
       last_year_price_per_sqm = EXCLUDED.last_year_price_per_sqm,
       use_category = EXCLUDED.use_category,
       location = EXCLUDED.location,
       standard_lot_number = EXCLUDED.standard_lot_number,
       prefecture = EXCLUDED.prefecture,
       municipality = EXCLUDED.municipality,
       lat = EXCLUDED.lat,
       lon = EXCLUDED.lon,
       updated_at = now()`,
    [
      rows.map((r) => r.pointId),
      rows.map(() => year),
      rows.map((r) => r.landPriceType),
      rows.map((r) => r.pricePerSqm),
      rows.map((r) => r.lastYearPricePerSqm),
      rows.map((r) => r.useCategory),
      rows.map((r) => r.location),
      rows.map((r) => r.standardLotNumber),
      rows.map((r) => r.prefecture),
      rows.map((r) => r.municipality),
      rows.map((r) => r.lat),
      rows.map((r) => r.lon),
    ],
  );

  const withCoords = rows.filter(
    (r) => r.lat !== null && r.lon !== null,
  ).length;
  console.log(
    `地点を保存した: ${rows.length} 件（うち座標つき ${withCoords} 件）年=${year}`,
  );
}

// 地価を取得するメイン関数
async function main() {
  const municipalities = await prisma.municipalityWealth.findMany({
    where: {
      lat: { not: null },
      lon: { not: null },
    },
  });

  console.log(
    `Found ${municipalities.length} municipalities with coordinates.`,
  );

  let updatedCount = 0;
  /** 当年価格を読めなかった地点の数。0 で埋めずに数える。 */
  let skippedPoints = 0;
  /**
   * 見つけた地点。タイルを使い回すので同じ地点が何度も来る。
   * 鍵で畳んでから、最後にまとめて 1 度だけ書く。
   */
  const collectedPoints = new Map<string, LandPricePoint>();

  for (let i = 0; i < municipalities.length; i++) {
    const m = municipalities[i];
    if (!m.lat || !m.lon) continue;

    const { z, x, y } = latLonToTile(m.lat, m.lon);
    const tileKey = `${z}_${x}_${y}`;

    let geojsonData = tileCache[tileKey];

    if (!geojsonData) {
      try {
        const url = `https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002?response_format=geojson&z=${z}&x=${x}&y=${y}&year=${YEAR}`;
        const res = await fetch(url, {
          headers: {
            "Ocp-Apim-Subscription-Key": API_KEY,
            Accept: "*/*",
          },
        });

        if (res.status === 404) {
          // タイルにデータがない場合
          geojsonData = { features: [] };
          tileCache[tileKey] = geojsonData;
        } else if (!res.ok) {
          console.error(
            `API Error for tile ${tileKey} (City: ${m.areaName}): ${res.status} ${res.statusText}`,
          );
          continue;
        } else {
          geojsonData = await res.json();
          tileCache[tileKey] = geojsonData;
          // Rate limit対策のために1秒待機
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error(`Fetch failed for tile ${tileKey}: ${toLogMessage(err)}`);
        continue;
      }
    }

    /*
      価格を取り出す。**推測はしない。**

      以前はここで price / LandPrice / 地価 / P01 / P01_006 を順に
      試し、当たらなければ「properties の中で 1000 より大きい数値を
      何でも 1 つ」拾っていた。probe で実物を見たところ、5 つの
      項目名は**どれも存在しない**。つまり必ず最後の手段に落ちて
      おり、キーの並び順から **point_id（地点の整理番号）**が
      「地価」として保存されていた。詳しくは landPriceParse.ts。

      当年価格は u_current_years_price_ja に "1,970,000(円/㎡)" の
      形で入る。取れない地点は数えて報告し、別の数字で埋めない。
    */
    const features = geojsonData.features || [];
    let totalPrice = 0;
    let count = 0;

    for (const feature of features) {
      const point = toLandPricePoint(feature);
      if (!point) {
        skippedPoints++;
        continue;
      }
      totalPrice += point.pricePerSqm;
      count++;

      /*
        地点そのものも残す。市区町村ごとの 1 つの数字だけでは
        「この土地の値段は普通か」に答えられない（その数字自体、
        代表点が入るタイル 1 枚の平均でしかない）。

        鍵は (point_id, year, land_price_type)。タイルは使い回すので
        同じ地点が何度も来るが、二度目以降は更新になるだけで
        行は増えない。
      */
      collectedPoints.set(`${point.pointId}_${point.landPriceType}`, point);
    }

    if (count > 0) {
      const avgPrice = Math.round(totalPrice / count);
      await prisma.municipalityWealth.update({
        where: { id: m.id },
        data: { landPricePerSqm: avgPrice },
      });
      console.log(
        `Updated ${m.areaName} - Avg Price: ¥${avgPrice}/sqm (from ${count} points)`,
      );
      updatedCount++;
    } else {
      console.log(
        `No land price points found for ${m.areaName} in tile ${tileKey}.`,
      );
    }

    // 定期的な進捗報告
    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1} / ${municipalities.length} ...`);
    }
  }

  await saveLandPricePoints(collectedPoints);

  console.log(
    `Finished! Updated ${updatedCount} municipalities with land price data.`,
  );
  console.log(`対象年: ${YEAR}`);
  if (skippedPoints > 0) {
    console.log(
      `当年価格を読めなかった地点: ${skippedPoints} 件（0 で埋めずに除外した）`,
    );
  }
}

main()
  .catch((e) => {
    console.error("Unhandled Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
