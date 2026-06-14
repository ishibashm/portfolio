import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SYSTEM_USER_ID = "local-user";

async function cleanupDB() {
  console.log("Cleaning up system documents...");
  const result = await prisma.knowledgeDocument.deleteMany({
    where: { user_id: SYSTEM_USER_ID },
  });
  console.log(`Deleted ${result.count} documents.`);
}

cleanupDB()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
