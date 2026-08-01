/**
 * user_configs を Supabase の user.id（UUID）で引けるようにする。
 *
 * これまで主キー相当は user_email だった。Supabase 側でメールアドレスを
 * 変更すると行が孤児になり、保存済みプロフィールが全て見えなくなる。
 *
 * 追加のみの移行:
 *   1. user_id 列と一意インデックスを足す（NULL 許容なので既存行に影響しない）
 *   2. auth.users からメールアドレス一致で埋める
 *
 * user_email は表示とフォールバックのために残す。
 * 既定はドライラン。実際に流すには MIGRATE_APPLY=true が必要。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL is not set.");
}

const APPLY = process.env.MIGRATE_APPLY === "true";

async function main() {
  const pool = new Pool({ connectionString, max: 1 });
  const q = async (sql: string, params: any[] = []) =>
    (await pool.query(sql, params)).rows;

  try {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

    const before = await q(
      `SELECT user_email,
              to_jsonb(c) ? 'user_id' AS has_column
         FROM user_configs c ORDER BY user_email`,
    );
    console.log(`user_configs rows: ${before.length}`);
    for (const r of before) console.log(`  ${r.user_email}`);

    // メールアドレスで auth.users と突き合わせたときに何件埋まるかを先に見る
    const matches = await q(
      `SELECT c.user_email, u.id AS auth_id
         FROM user_configs c
         LEFT JOIN auth.users u ON lower(u.email) = lower(c.user_email)
        ORDER BY c.user_email`,
    );
    console.log("\nMatch against auth.users:");
    for (const m of matches) {
      console.log(`  ${m.user_email} -> ${m.auth_id ?? "(no auth user)"}`);
    }
    const unmatched = matches.filter((m) => !m.auth_id).length;
    if (unmatched > 0) {
      console.log(
        `\n::warning::${unmatched} row(s) have no matching auth user; they keep user_id NULL and stay reachable by email.`,
      );
    }

    if (!APPLY) {
      console.log("\nDry run. Set MIGRATE_APPLY=true to apply.");
      return;
    }

    await q(`ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS user_id uuid`);
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS user_configs_user_id_key
         ON user_configs (user_id) WHERE user_id IS NOT NULL`,
    );
    const filled = await pool.query(
      `UPDATE user_configs c
          SET user_id = u.id
         FROM auth.users u
        WHERE lower(u.email) = lower(c.user_email)
          AND c.user_id IS DISTINCT FROM u.id`,
    );
    console.log(`\nBackfilled ${filled.rowCount ?? 0} row(s).`);

    const after = await q(
      `SELECT user_email, user_id FROM user_configs ORDER BY user_email`,
    );
    for (const r of after) console.log(`  ${r.user_email} -> ${r.user_id}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
