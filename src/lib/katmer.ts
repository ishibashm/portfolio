import { Pool } from "pg";

/**
 * Katmer Cloud (katmer.cloud-palette.com) の Postgres への接続。
 *
 * ナレッジベースの実体は Katmer Cloud 側に一本化されており、こちらの
 * Prisma とは別プロジェクトの Supabase を指す。スキーマも完全には一致
 * しない（embedding が jsonb ではなく vector、user_id が NOT NULL）ため、
 * Prisma クライアントを流用せず素の SQL で必要な列だけを扱う。
 */

declare global {
  // eslint-disable-next-line no-var
  var __katmerPool: Pool | undefined;
}

function getPool(): Pool | null {
  const connectionString = process.env.KATMER_DATABASE_URL;
  if (!connectionString) return null;

  if (!global.__katmerPool) {
    global.__katmerPool = new Pool({
      connectionString,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global.__katmerPool;
}

/** Katmer Cloud 側のユーザー ID。KnowledgeDocument.user_id が NOT NULL のため必須。 */
async function resolveUserId(pool: Pool): Promise<string | null> {
  const email = process.env.ADMIN_EMAIL;
  if (email) {
    const byEmail = await pool.query<{ id: string }>(
      `select id from "User" where lower(email) = lower($1) limit 1`,
      [email],
    );
    if (byEmail.rows[0]) return byEmail.rows[0].id;
  }
  // シングルユーザー運用なので、ADMIN_EMAIL 未設定でも1人だけなら特定できる
  const only = await pool.query<{ id: string }>(`select id from "User" limit 2`);
  return only.rows.length === 1 ? only.rows[0].id : null;
}

export type KatmerDocumentRef = { title: string; domain: string | null };

export async function katmerFindByTitleAndDomain(
  title: string,
  domain: string,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) throw new Error("KATMER_DATABASE_URL is not configured");

  const res = await pool.query(
    `select 1 from "KnowledgeDocument" where title = $1 and domain = $2 limit 1`,
    [title, domain],
  );
  return res.rowCount! > 0;
}

export async function katmerInsertDocument(input: {
  title: string;
  content: string;
  domain: string;
  category: string;
  type?: string;
  status?: string;
  priority?: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("KATMER_DATABASE_URL is not configured");

  const userId = await resolveUserId(pool);
  if (!userId) throw new Error("Could not resolve a Katmer Cloud user_id");

  await pool.query(
    `insert into "KnowledgeDocument"
       (status, priority, type, user_id, title, content, tags, domain, category)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.status ?? "Draft",
      input.priority ?? "Medium",
      input.type ?? "Note",
      userId,
      input.title,
      input.content,
      [],
      input.domain,
      input.category,
    ],
  );
}

export async function katmerListRefs(
  categories: string[],
): Promise<KatmerDocumentRef[]> {
  const pool = getPool();
  if (!pool) throw new Error("KATMER_DATABASE_URL is not configured");

  const res = await pool.query<KatmerDocumentRef>(
    `select title, domain from "KnowledgeDocument" where category = any($1)`,
    [categories],
  );
  return res.rows;
}

export async function katmerDeleteByTitleAndDomain(
  title: string,
  domain: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("KATMER_DATABASE_URL is not configured");

  await pool.query(
    `delete from "KnowledgeDocument" where title = $1 and domain = $2`,
    [title, domain],
  );
}
