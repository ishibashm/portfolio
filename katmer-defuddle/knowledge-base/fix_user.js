const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Ensure local-user exists
  let user = await prisma.user.findUnique({ where: { id: "local-user" } });
  if (!user) {
    await prisma.user.create({
      data: {
        id: "local-user",
        name: "Local Admin",
        email: "admin@local",
      },
    });
  }

  const result = await prisma.knowledgeDocument.updateMany({
    where: {
      user_id: "00000000-0000-0000-0000-000000000000",
    },
    data: {
      user_id: "local-user",
    },
  });
  console.log(`Updated ${result.count} records to local-user.`);
}

main().finally(() => prisma.$disconnect());
