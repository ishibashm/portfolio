import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  try {
    const count = await prisma.knowledgeDocument.count();
    console.log(`Current Document Count in DB: ${count}`);
  } catch (e) {
    console.error("DB Connection Failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
