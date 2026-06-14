import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  try {
    const result: any =
      await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size;`;
    console.log(`Current DB Size: ${result[0].size}`);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
