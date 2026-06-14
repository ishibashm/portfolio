import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const totalDocs = await prisma.knowledgeDocument.count();

    // Check how many have embeddings by running a raw query
    // since Prisma doesn't directly support counting where an Unsupported field is not null in the high-level API easily
    const result = await prisma.$queryRaw`
      SELECT count(*) as count 
      FROM "KnowledgeDocument" 
      WHERE embedding IS NOT NULL;
    `;

    console.log(`Total documents: ${totalDocs}`);
    console.log(`Documents with embeddings: ${result[0].count}`);
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
