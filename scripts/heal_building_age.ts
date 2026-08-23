import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("🔄 データベース内の築年数データを高速補正中...");
    console.log("⚡ 超高速一括SQLを実行しています...");

    const start = Date.now();

    // 1回のSQLクエリで、データベース側で正規表現パースと一括アップデートを行います
    const updatedCount = await prisma.$executeRawUnsafe(`
      UPDATE rental_properties
      SET 
        building_age = COALESCE(
          CAST(substring(property_name from '(?:築)?([0-9]+)年') AS INTEGER),
          CASE WHEN property_name LIKE '%新築の賃貸物件%' THEN 0 ELSE building_age END
        ),
        is_new_build = CASE 
          WHEN property_name LIKE '%新築の賃貸物件%' THEN TRUE 
          ELSE FALSE 
        END
      WHERE 
        property_name LIKE '%の賃貸物件%'
        AND (
          building_age IS NULL 
          OR building_age = 0 
          OR is_new_build IS NULL
        );
    `);

    const end = Date.now();
    const duration = ((end - start) / 1000).toFixed(2);

    console.log(`✅ データベースの一括高速修復が完了しました！`);
    console.log(`- 補正された物件レコード数: ${updatedCount} 件`);
    console.log(`- 所要時間: ${duration} 秒`);
  } catch (error) {
    console.error("❌ 修復処理中にエラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
