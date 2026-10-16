import type { McpGrant, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createMcpAuditStore } from "@/lib/mcpAuditStore";
import { McpConsentError } from "@/lib/mcpConsent";

/** Same owner lock as registration deletion. Never derives an owner from email. */
async function lockOwner(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 21092026))`;
}

/** Called inside the existing registration deletion transaction, after its owner
 * lock. Keep runtime configuration installed during rollback: flag-off must not
 * let deleted data become readable again when the endpoint is re-enabled. */
export async function revokeMcpOnRegistrationDeletion(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  if (
    process.env.MCP_MEMORY_KEYS ||
    process.env.MCP_MEMORY_ENABLED === "true"
  ) {
    if (!z.uuid().safeParse(userId).success)
      throw new Error("MCP_INVALID_OWNER");
    await tx.memoryEntry.deleteMany({ where: { userId } });
  }
  if (
    !process.env.MCP_RUNTIME_CONFIG &&
    process.env.MCP_PERSONAL_ENABLED !== "true"
  )
    return;
  if (!z.uuid().safeParse(userId).success) throw new Error("MCP_INVALID_OWNER");
  const started = performance.now();
  await tx.mcpGrant.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // The provider store checks this tombstone on every code/refresh/access write
  // and read. Retain it through the connection lifetime; no token can revive it.
  await createMcpAuditStore({ db: tx }).record({
    userId,
    grantId: null,
    event: "revoke",
    result: "revoked",
    durationMs: Math.floor(performance.now() - started),
  });
}

/** Serialize the final consent against deletion and re-read the selected set
 * under the lock. A stale consent page cannot authorize deleted/replaced data. */
export function createMcpConsentGrantWriter(
  db: Pick<PrismaClient, "$transaction">,
) {
  return async (data: McpGrant, expected: { id: string; name: string }[]) => {
    try {
      return await db.$transaction(async (tx) => {
        await lockOwner(tx, data.userId);
        const row = await tx.user_configs.findFirst({
          where: { user_id: data.userId },
          select: { presets: true },
        });
        const profiles = z
          .array(z.object({ id: z.string(), name: z.string() }))
          .max(100)
          .safeParse(row?.presets);
        if (
          !profiles.success ||
          JSON.stringify(profiles.data) !== JSON.stringify(expected) ||
          data.allowedProfileIds.some(
            (id) => !profiles.data.some((p) => p.id === id),
          )
        )
          throw new McpConsentError("INVALID_REQUEST");
        await tx.mcpGrant.create({ data });
      });
    } catch (error) {
      if (error instanceof McpConsentError) throw error;
      throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
    }
  };
}
