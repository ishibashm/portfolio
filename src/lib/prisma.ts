import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Lazy initialization function
export const getPrisma = () => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  try {
    const client = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
    return client;
  } catch (e) {
    console.error("Failed to lazy-init Prisma:", e);
    throw e;
  }
};

// For backward compatibility (might crash if accessed at module load, but purely importing this file won't crash)
// We use a getter to delay initialization until property access
export const prisma = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const client = getPrisma();
    return (client as any)[prop];
  }
});

export let initializationError: any = null;
