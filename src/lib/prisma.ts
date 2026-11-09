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

/**
 * DB に繋がらないとき、接続を張るのを何ミリ秒で諦めるか。
 *
 * 2026-11-07 に DB のインスタンスが無くなり、接続は拒否されずに応答が
 * 無くなった。pg の Pool は既定で接続の待ち時間に上限が無く（0）、OS が
 * SYN の再送を諦めるまで約 2 分待つ。
 *
 * - **ビルド**: 記事一覧などは DB が読めなければ Markdown に落ちる作りだが、
 *   落ちる前に 1 頁 60 秒の上限を越え、3 回の再試行のあとビルドごと落ちた
 *   （#1793 のデプロイ。`/api/telemetry/history` と `/llms-full.txt`）。
 *   **DB が落ちていると、接続先を切り替えるための再デプロイも通らない**
 * - **本番**: DB を読む API が 2 分以上待ってから 500 / 504 を返していた
 *
 * CI のビルドが通っていたのは、接続先が localhost で即座に拒否されるから。
 * 「応答が無い」相手は CI では再現しない。
 *
 * 上限が掛かるのは**接続を張るまで**だけで、張れた後の問い合わせの長さには
 * 掛からない。ふだんの接続は 1 秒もかからない。
 */
export function connectionTimeoutMs(
  phase: string | undefined = process.env.NEXT_PHASE,
): number {
  return phase === "phase-production-build" ? 5_000 : 10_000;
}

const prismaClientSingleton = () => {
  warnIfPointingAtProduction();
  // connectionString defaults to process.env.DATABASE_URL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: connectionTimeoutMs(),
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = prismaClientSingleton(); // TEMPORARILY BYPASS CACHE TO LOAD NEW SCHEMA

export default prisma;

// if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
