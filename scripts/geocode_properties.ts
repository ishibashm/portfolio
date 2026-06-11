import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalize } from "@geolonia/normalize-japanese-addresses";
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

async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    // 住所の正規化とジオコーディングを同時に行う（API通信なしでローカル辞書ベースで高速・高精度に処理されます）
    // 例: "東京都港区新橋６丁目1-2 マンション名" -> "東京都", "港区", "新橋六丁目" を抽出し、丁目の中心座標を返します
    const result = await normalize(address);

    // レベル3（町名・丁目）以上の精度で座標が取得できた場合のみ採用
    if (result.point && result.point.lat && result.point.lng) {
      return {
        lat: result.point.lat,
        lon: result.point.lng,
      };
    }

    return null;
  } catch (error) {
    console.error(`Geocoding failed for ${address}:`, error);
    return null;
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    let totalSuccess = 0;
    let totalFail = 0;
    let batchNumber = 1;

    while (true) {
      // 緯度経度がまだ設定されていない物件を取得
      const unmappedProperties = await prisma.rental_properties.findMany({
        where: {
          lat: null,
          lon: null,
          address: { not: null, not: "" },
        },
        orderBy: { created_at: "desc" },
        take: 1000, // 一度に処理する件数
      });

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
        if (!prop.address) continue;

        const coords = await geocodeAddress(prop.address);

        if (coords) {
          await prisma.rental_properties.update({
            where: { id: prop.id },
            data: {
              lat: coords.lat,
              lon: coords.lon,
            },
          });
          console.log(
            `✅ [Success] ${prop.address} -> (${coords.lat}, ${coords.lon})`,
          );
          batchSuccessCount++;
          totalSuccess++;
        } else {
          console.log(
            `❌ [Failed] Could not find coordinates for: ${prop.address}`,
          );
          batchFailCount++;
          totalFail++;
        }

        // Geoloniaの正規化はAPIリクエストを伴わないため、待機時間は最小限でOKです
        await new Promise((res) => setTimeout(res, 50));
      }

      console.log(`\n📊 Batch #${batchNumber} Results:`);
      console.log(`   - Successfully updated: ${batchSuccessCount}`);
      console.log(`   - Failed to locate: ${batchFailCount}`);

      batchNumber++;
    }

    console.log(`\n======================================================`);
    console.log(`🏆 Final Geocoding Results (Powered by Geolonia):`);
    console.log(`   - Total successfully updated: ${totalSuccess}`);
    console.log(`   - Total failed to locate: ${totalFail}`);
    console.log(`======================================================\n`);
  } catch (e) {
    console.error("Fatal error during geocoding:", e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
