import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };


let prismaInstance: PrismaClient | undefined;

try {
  prismaInstance =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
} catch (e) {
  console.error('Failed to initialize Prisma Client:', e);
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== 'production' && prisma) globalForPrisma.prisma = prisma;
