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
    const count = await prisma.rental_properties.count();
    console.log(`\n🏢 現在データベースに保存されている物件数: ${count.toLocaleString()} 件\n`);
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();