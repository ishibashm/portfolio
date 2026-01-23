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
  // Re-throw or handle? For now just log, but maybe we should let it crash to see the error in logs
  console.error("ENV Info:", {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL_EXISTS: !!process.env.DATABASE_URL
  });
}

if (process.env.NODE_ENV !== "production" && prisma) globalForPrisma.prisma = prisma;

export { prisma };
