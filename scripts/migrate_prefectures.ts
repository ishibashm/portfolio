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
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error(
      "\n❌ エラー: 移行先（本番環境）の接続URLを引数に指定してください。",
    );
    console.error(
      '使用例: npx tsx scripts/migrate_prefectures.ts "postgresql://..."\n',
    );
    process.exit(1);
  }

  // 1. ローカルDBからデータを取得する
  console.log(
    "\n1. ローカルデータベースから愛知県・岐阜県・滋賀県の物件を取得しています...",
  );
  const localPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  const localAdapter = new PrismaPg(localPool);
  const localPrisma = new PrismaClient({ adapter: localAdapter });

  /* 形は Prisma の戻りから引く。列を書き写すとスキーマとずれる。 */
  type RentalRow = Awaited<
    ReturnType<typeof localPrisma.rental_properties.findMany>
  >[number];
  let properties: RentalRow[] = [];
  try {
    properties = await localPrisma.rental_properties.findMany({
      where: {
        OR: [
          { address: { contains: "愛知県" } },
          { address: { contains: "岐阜県" } },
          { address: { contains: "滋賀県" } },
        ],
      },
    });
    console.log(
      `   ローカルから取得完了: ${properties.length.toLocaleString()} 件`,
    );
  } catch (err) {
    console.error("❌ ローカルからの取得中にエラーが発生しました:", err);
    await localPrisma.$disconnect();
    await localPool.end();
    process.exit(1);
  } finally {
    await localPrisma.$disconnect();
    await localPool.end();
  }

  if (properties.length === 0) {
    console.log("⚠️ 移行対象の物件がありません。");
    process.exit(0);
  }

  // 2. 本番DBへ接続し、データを流し込む
  console.log("2. 移行先（本番環境）のデータベースへ接続しています...");
  const targetPool = new Pool({ connectionString: targetUrl, max: 1 });
  const targetAdapter = new PrismaPg(targetPool);
  const targetPrisma = new PrismaClient({ adapter: targetAdapter });

  try {
    console.log(
      "   本番データベースへ物件データを流し込み中 (skipDuplicates: true)...",
    );

    const CHUNK_SIZE = 1000;
    let successCount = 0;

    for (let i = 0; i < properties.length; i += CHUNK_SIZE) {
      const chunk = properties.slice(i, i + CHUNK_SIZE);

      const mappedChunk = chunk.map((p) => ({
        id: p.id,
        property_name: p.property_name,
        area: p.area,
        rent: p.rent ? Number(p.rent) : null,
        management_fee: p.management_fee ? Number(p.management_fee) : null,
        layout: p.layout,
        size_sqm: p.size_sqm,
        is_new_build: p.is_new_build,
        minutes_to_station: p.minutes_to_station,
        first_seen_at: p.first_seen_at,
        last_seen_at: p.last_seen_at,
        source_emails: p.source_emails,
        created_at: p.created_at,
        url: p.url,
        address: p.address,
        lat: p.lat,
        lon: p.lon,
        building_age: p.building_age,
        floor: p.floor,
        source_scraper: p.source_scraper,
      }));

      await targetPrisma.rental_properties.createMany({
        data: mappedChunk,
        skipDuplicates: true,
      });

      successCount += chunk.length;
      console.log(
        `   進行状況: ${successCount.toLocaleString()} / ${properties.length.toLocaleString()} 件を挿入完了`,
      );
    }

    console.log(
      `\n🎉 移行が成功しました！合計 ${successCount.toLocaleString()} 件の物件を書き込みました。`,
    );
  } catch (err) {
    console.error(
      "\n❌ 本番データベースへの書き込み中にエラーが発生しました:",
      err,
    );
  } finally {
    await targetPrisma.$disconnect();
    await targetPool.end();
  }
}

main();
