import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateMetadata() {
  const docs = await prisma.knowledgeDocument.findMany();
  let updatedCount = 0;

  for (const doc of docs) {
    let newTitle = doc.title;

    // タイトルを分かりやすくする
    newTitle = newTitle.replace(/^\d{4}-\d{2}-\d{2}T\d{6}\+\d{4}_/, "");
    newTitle = newTitle.replace(/^\d{14}-/, "");
    newTitle = newTitle.trim();

    // 変更があれば更新する
    if (newTitle !== doc.title) {
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { title: newTitle },
      });
      console.log(`Updated title: ${doc.title} -> ${newTitle}`);
      updatedCount++;
    }
  }

  console.log(`Finished updating metadata. Total updated: ${updatedCount}`);
}

updateMetadata()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
