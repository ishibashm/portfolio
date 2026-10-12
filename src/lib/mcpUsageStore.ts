import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { McpPrivacyError } from "@/lib/mcpAuditStore";
import type { McpAuthBudget } from "@/lib/mcpAuth";

/** Dormant last-use writer. Invoke once after successful authenticated execution,
 * within the original request budget, before publishing its result. No site DB
 * singleton, timers or background writes. The injected DB must independently
 * bound I/O and disable query/error logging; budget checks cannot cancel SQL.
 */
export function createMcpUsageStore(deps: {
  db: Pick<PrismaClient, "$executeRaw">;
}) {
  return {
    async markUsed(userId: string, grantId: string, budget: McpAuthBudget) {
      const check = () => {
        const remaining = budget.remainingMs();
        if (
          budget.signal.aborted ||
          !Number.isFinite(remaining) ||
          remaining <= 0 ||
          remaining > 5000
        )
          throw new McpPrivacyError();
      };
      try {
        if (
          !z.uuid().safeParse(userId).success ||
          !z.uuid().safeParse(grantId).success
        )
          throw new McpPrivacyError();
        check();
        // A single conditional update cannot resurrect a revoked grant, change
        // its consent/expiry, or let an older completion rewind lastUsedAt.
        // Use DB time; never accept a client-provided timestamp.
        const count = await deps.db.$executeRaw`
          UPDATE "McpGrant"
          SET "lastUsedAt" = GREATEST(COALESCE("lastUsedAt", statement_timestamp()), statement_timestamp())
          WHERE "id" = ${grantId}::uuid AND "userId" = ${userId}::uuid
            AND "revokedAt" IS NULL
            AND "createdAt" <= statement_timestamp()
            AND "expiresAt" > statement_timestamp()`;
        check();
        if (count !== 1) throw new McpPrivacyError();
      } catch {
        throw new McpPrivacyError();
      }
    },
  };
}
