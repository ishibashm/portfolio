import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DAY = 86400000;

/** Remove expired protocol state and connections after a 30-day grace period. */
export async function cleanupOAuthState(
  prisma,
  now = new Date(),
  apply = false,
) {
  const expiredConnectionBefore = new Date(now.getTime() - 30 * DAY);
  const recordWhere = { expiresAt: { lt: now } };
  const connectionWhere = { expiresAt: { lt: expiredConnectionBefore } };
  if (!apply) {
    return {
      dryRun: true,
      records: await prisma.mcpOauthRecord.count({ where: recordWhere }),
      connections: await prisma.mcpOauthConnection.count({
        where: connectionWhere,
      }),
    };
  }
  const [records, connections] = await Promise.all([
    prisma.mcpOauthRecord.deleteMany({ where: recordWhere }),
    prisma.mcpOauthConnection.deleteMany({ where: connectionWhere }),
  ]);
  return {
    dryRun: false,
    records: records.count,
    connections: connections.count,
  };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.MCP_OAUTH_CLEANUP_ENABLED !== "true")
    throw new Error("MCP_OAUTH_CLEANUP_ENABLED=true is required for --apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await cleanupOAuthState(prisma, new Date(), apply);
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
