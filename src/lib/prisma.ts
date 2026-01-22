import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prisma: PrismaClient;

try {
  prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ["query"],
    });
} catch (error) {
  console.error("Failed to initialize Prisma Client:", error);
  // Fallback to avoid module crash, though functionality will be broken
  prisma = new PrismaClient();
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { prisma };
