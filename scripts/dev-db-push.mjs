/**
 * 開発用 DB へスキーマを流す。
 *
 * prisma db push --accept-data-loss を素で npm script に置くと、
 * .env.local を消した状態で叩いたときに本番へ向かう。取り返しがつかないので、
 * 接続先がローカルであることを確認してからでないと実行しない。
 */
import { spawnSync } from "node:child_process";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const url = process.env.DATABASE_URL || "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("DATABASE_URL が読めません。");
  process.exit(1);
}

if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(
    [
      "",
      `  接続先がローカルではありません: ${host}`,
      "  db push は開発用 DB に対してのみ実行します。",
      "",
      "    cp .env.local.example .env.local",
      "    npm run dev:db:up",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// schema.prisma の既定値が uuid_generate_v4() を使う。Supabase には最初から
// 入っているが素の Postgres には無く、入れないと CreateTable の時点で落ちる。
const { Pool } = await import("pg");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
} finally {
  await pool.end();
}

console.log(`Pushing schema to ${host} ...`);
// shell: true が無いと Windows で npx を解決できず、何も出力せずに失敗する。
const r = spawnSync("npx prisma db push --accept-data-loss", {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
