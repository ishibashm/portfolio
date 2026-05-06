import * as dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: '.env.local' });

import { PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// APIキーは環境変数から取得
const API_KEY = process.env.LIBRARY_API_KEY;
if (!API_KEY) {
  console.error("Error: LIBRARY_API_KEY environment variable is not set.");
  process.exit(1);
}

// 緯度経度からタイル座標(z, x, y)を計算する関数 (ズームレベル15固定)
function latLonToTile(lat: number, lon: number, zoom: number = 15) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { z: zoom, x, y };
}

// タイルのキャッシュ
const tileCache: Record<string, any> = {};

// 地価を取得するメイン関数
async function main() {
  const municipalities = await prisma.municipalityWealth.findMany({
    where: {
      lat: { not: null },
      lon: { not: null },
    },
  });

  console.log(`Found ${municipalities.length} municipalities with coordinates.`);

  let updatedCount = 0;

  for (let i = 0; i < municipalities.length; i++) {
    const m = municipalities[i];
    if (!m.lat || !m.lon) continue;

    const { z, x, y } = latLonToTile(m.lat, m.lon);
    const tileKey = `${z}_${x}_${y}`;

    let geojsonData = tileCache[tileKey];

    if (!geojsonData) {
      try {
        const url = `https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002?response_format=geojson&z=${z}&x=${x}&y=${y}&year=2023`;
        const res = await fetch(url, {
          headers: {
            "Ocp-Apim-Subscription-Key": API_KEY,
            "Accept": "*/*"
          }
        });
        
        if (res.status === 404) {
          // タイルにデータがない場合
          geojsonData = { features: [] };
          tileCache[tileKey] = geojsonData;
        } else if (!res.ok) {
          console.error(`API Error for tile ${tileKey} (City: ${m.areaName}): ${res.status} ${res.statusText}`);
          continue;
        } else {
          geojsonData = await res.json();
          tileCache[tileKey] = geojsonData;
          // Rate limit対策のために1秒待機
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        console.error(`Fetch failed for tile ${tileKey}: ${err.message}`);
        continue;
      }
    }

    // geojsonDataから価格を抽出
    const features = geojsonData.features || [];
    let totalPrice = 0;
    let count = 0;

    for (const feature of features) {
      // API仕様によると、地価は properties.price 等に入っているはずだが、念のためダンプして確認が必要
      // 国交省APIの一般的なプロパティ名は「price」または「地価」に関連するもの
      // 今回は柔軟に複数パターンを試す
      const price = feature.properties?.price || feature.properties?.LandPrice || feature.properties?.["地価"] || feature.properties?.P01 || parseInt(feature.properties?.P01_006 || "0"); // P01_006 is commonly used for price in some MLIT datasets
      if (price) {
        const numPrice = Number(price);
        if (!isNaN(numPrice)) {
          totalPrice += numPrice;
          count++;
        }
      } else {
        // デバッグ用: プロパティのキーを確認
        // console.log("Available properties:", Object.keys(feature.properties || {}));
        // 値のパースに努める
        const anyPrice = Object.values(feature.properties || {}).find(v => typeof v === 'number' && v > 1000);
        if (anyPrice) {
          totalPrice += anyPrice as number;
          count++;
        }
      }
    }

    if (count > 0) {
      const avgPrice = Math.round(totalPrice / count);
      await prisma.municipalityWealth.update({
        where: { id: m.id },
        data: { landPricePerSqm: avgPrice }
      });
      console.log(`Updated ${m.areaName} - Avg Price: ¥${avgPrice}/sqm (from ${count} points)`);
      updatedCount++;
    } else {
      console.log(`No land price points found for ${m.areaName} in tile ${tileKey}.`);
    }
    
    // 定期的な進捗報告
    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1} / ${municipalities.length} ...`);
    }
  }

  console.log(`Finished! Updated ${updatedCount} municipalities with land price data.`);
}

main()
  .catch(e => {
    console.error("Unhandled Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
