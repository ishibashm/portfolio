import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = fs.existsSync(path.resolve(process.cwd(), '.env'))
  ? path.resolve(process.cwd(), '.env')
  : path.resolve(process.cwd(), '../.env');
dotenv.config({ path: envPath });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const aichi = await prisma.rental_properties.count({
      where: { address: { contains: '愛知県' } }
    });
    const gifu = await prisma.rental_properties.count({
      where: { address: { contains: '岐阜県' } }
    });
    const shiga = await prisma.rental_properties.count({
      where: { address: { contains: '滋賀県' } }
    });
    
    console.log(`\n🏢 愛知県: ${aichi.toLocaleString()} 件`);
    console.log(`🏢 岐阜県: ${gifu.toLocaleString()} 件`);
    console.log(`🏢 滋賀県: ${shiga.toLocaleString()} 件`);
    console.log(`合計: ${(aichi + gifu + shiga).toLocaleString()} 件\n`);
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
