import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prisma: PrismaClient | undefined;

try {
  prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ["query"],
    });
} catch (error) {
  console.error("Failed to initialize Prisma Client:", error);
}

if (process.env.NODE_ENV !== "production" && prisma) globalForPrisma.prisma = prisma;

export { prisma };
