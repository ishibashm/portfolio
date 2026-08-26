import { PrismaClient } from "@prisma/client";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * 開発サーバが本番 DB を向いていないか確認する。
 *
 * 分けていないと、ページを開いただけで走る書き込み（例: /api/user-config への
 * POST）が本番の行を上書きする。実際に birth_date と base 座標を潰したことがある。
 * 読み取り目的で本番を向けたい場面はあるので落とさず、必ず気付く形で出す。
 */
const warnIfPointingAtProduction = () => {
  if (process.env.NODE_ENV !== "development") return;

  const url = process.env.DATABASE_URL || "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (!host || host === "localhost" || host === "127.0.0.1") return;

  console.warn(
    [
      "",
      "  ⚠  開発サーバが本番 DB を向いています: " + host,
      "     ページを開くだけで本番のデータが書き換わることがあります。",
      "",
      "     分けるには:  cp .env.local.example .env.local",
      "                  npm run dev:db:up && npm run dev:db:push",
      "",
    ].join("\n"),
  );
};

const prismaClientSingleton = () => {
  warnIfPointingAtProduction();
  // connectionString defaults to process.env.DATABASE_URL
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = prismaClientSingleton(); // TEMPORARILY BYPASS CACHE TO LOAD NEW SCHEMA

export default prisma;

// if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
