import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };


let prismaInstance: PrismaClient | undefined;
export let initializationError: any = null;

try {
  prismaInstance =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  // console.log("Skipping Prisma init for crash isolation");
  // prismaInstance = undefined;
} catch (e) {
  console.error('Failed to initialize Prisma Client:', e);
  initializationError = e;
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== 'production' && prisma) globalForPrisma.prisma = prisma;
