import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const sample = await prisma.municipalityWealth.findMany({
    take: 10,
  });
  console.log("Sample rows:", sample);

  const aichiRows = await prisma.municipalityWealth.findMany({
    where: {
      areaName: {
        contains: "愛知",
      },
    },
    take: 5,
  });
  console.log("Aichi name matching rows:", aichiRows);

  const code23Rows = await prisma.municipalityWealth.findMany({
    where: {
      areaCode: {
        startsWith: "23",
      },
    },
    take: 5,
  });
  console.log("Code 23 matching rows:", code23Rows);

  const distinctPrefCodes = new Set();
  const allRows = await prisma.municipalityWealth.findMany({
    select: { areaCode: true },
  });
  allRows.forEach((r) => distinctPrefCodes.add(r.areaCode.substring(0, 2)));
  console.log(
    "Prefecture prefixes present in DB:",
    Array.from(distinctPrefCodes).sort(),
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
