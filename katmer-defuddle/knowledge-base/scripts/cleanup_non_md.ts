import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Running fast cleanup for image and non-md files...");

  // Title-based bulk deletion
  const titleResult = await prisma.knowledgeDocument.deleteMany({
    where: {
      OR: [
        { title: { endsWith: ".png", mode: "insensitive" } },
        { title: { endsWith: ".jpg", mode: "insensitive" } },
        { title: { endsWith: ".jpeg", mode: "insensitive" } },
        { title: { endsWith: ".gif", mode: "insensitive" } },
        { title: { endsWith: ".webp", mode: "insensitive" } },
        { title: { endsWith: ".svg", mode: "insensitive" } },
        { title: { endsWith: ".pdf", mode: "insensitive" } },
        { title: { endsWith: ".json", mode: "insensitive" } },
        { title: { endsWith: ".webarchive", mode: "insensitive" } },
        { title: { contains: "Screenshot", mode: "insensitive" } },
        { title: { contains: "スクリーンショット", mode: "insensitive" } },
        // Driveからの偽装インポート対策
        { title: { endsWith: ".png.md", mode: "insensitive" } },
        { title: { endsWith: ".jpg.md", mode: "insensitive" } },
        { title: { endsWith: ".jpeg.md", mode: "insensitive" } },
        { title: { endsWith: ".gif.md", mode: "insensitive" } },
        { title: { endsWith: ".pdf.md", mode: "insensitive" } },
      ],
    },
  });

  console.log(
    `Deleted ${titleResult.count} records by title/extension matching.`,
  );

  // Content-based bulk deletion (for PNG, PDF signatures)
  // Prisima startsWith is available for strings
  const contentResult = await prisma.knowledgeDocument.deleteMany({
    where: {
      OR: [
        { content: { startsWith: "PNG" } },
        { content: { startsWith: "%PDF" } },
        { content: { startsWith: "bplist" } },
      ],
    },
  });

  console.log(
    `Deleted ${contentResult.count} records by binary content signature matching.`,
  );

  // Also try to find unhandled raw JSON contents or other anomalies safely
  const allDocs = await prisma.knowledgeDocument.findMany({
    select: { id: true, title: true, content: true },
  });

  let customDeletedCount = 0;
  for (const doc of allDocs) {
    if (doc.content.trim() === "{}" || doc.content.trim() === "[]") {
      await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
      customDeletedCount++;
    } else if (doc.content.startsWith("{\n") || doc.content.startsWith("[{")) {
      try {
        JSON.parse(doc.content);
        await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
        customDeletedCount++;
      } catch (e) {
        // Not a valid full JSON, keep it
      }
    }
  }

  console.log(`Deleted ${customDeletedCount} records by raw JSON matching.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
