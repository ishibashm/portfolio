import { PrismaClient } from "@prisma/client";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const prismaClientSingleton = () => {
  // connectionString defaults to process.env.DATABASE_URL
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = prismaClientSingleton(); // TEMPORARILY BYPASS CACHE TO LOAD NEW SCHEMA

export default prisma;

// if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
