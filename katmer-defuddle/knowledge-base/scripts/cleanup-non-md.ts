import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.knowledgeDocument.findMany({
    select: { id: true, title: true },
  });

  const extensionsToRemove = [
    ".txt",
    ".csv",
    ".json",
    ".jpg",
    ".png",
    ".pdf",
    ".txt_1",
    ".txt_2",
    ".txt_3",
  ];
  const toDelete = docs.filter((doc) => {
    return extensionsToRemove.some((ext) =>
      doc.title.toLowerCase().endsWith(ext),
    );
  });

  const specificNames = ["changes"];
  const toDeleteSpecific = docs.filter((doc) =>
    specificNames.includes(doc.title.toLowerCase()),
  );

  const finalToDelete = [...toDelete, ...toDeleteSpecific];

  if (finalToDelete.length === 0) {
    console.log("No non-md files found to delete.");
    return;
  }

  for (const doc of finalToDelete) {
    console.log(`Deleting: ${doc.title}`);
    await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
  }

  console.log(`Deleted ${finalToDelete.length} non-md documents.`);
}

main().finally(() => prisma.$disconnect());
