import type { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Lazy initialization function
export const getPrisma = () => {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  try {
    // Dynamic require to enforce runtime resolution
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");

    const client = new PrismaClient({
      log: ["query", "info", "warn", "error"],
    });
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
    return client;
  } catch (e) {
    console.error("Failed to lazy-init Prisma:", e);
    throw e;
  }
};

// For backward compatibility (might crash if accessed at module load, but purely importing this file won't crash)
// We use a getter to delay initialization until property access
export const prisma = new Proxy({} as unknown as PrismaClient, {
  get: (target, prop) => {
    const client = getPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)[prop];
  },
});

export let initializationError: any = null;
