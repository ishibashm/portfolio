import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const mcpAuditEvent = z.enum([
  "authorize",
  "refresh",
  "revoke",
  "initialize",
  "tools/list",
  "list_profiles",
  "get_profile",
  "judge_profile_directions",
  "judge_time_slots",
]);
export const mcpAuditResult = z.enum([
  "success",
  "denied",
  "revoked",
  "invalid",
  "limited",
  "unavailable",
]);
const auditInput = z.object({
  userId: z.uuid().nullable(),
  grantId: z.uuid().nullable(),
  event: mcpAuditEvent,
  result: mcpAuditResult,
  durationMs: z.number().int().min(0).max(2_147_483_647),
});
export type McpAuditInput = z.infer<typeof auditInput>;

export class McpPrivacyError extends Error {
  constructor() {
    super("TEMPORARILY_UNAVAILABLE");
    this.name = "McpPrivacyError";
  }
}

/** Dormant: inject a server-only DB client with query/error logging disabled.
 * No request bodies, profile identifiers, names, credentials or raw errors are
 * accepted into persistence. Unknown properties are deliberately projected out.
 * No timers/cleanup jobs are started by this factory.
 */
export function createMcpAuditStore(deps: {
  db: Pick<PrismaClient, "mcpAccessAudit" | "$executeRaw">;
  now?: () => Date;
}) {
  async function safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch {
      throw new McpPrivacyError();
    }
  }
  return {
    record(input: McpAuditInput) {
      return safe(async () => {
        const parsed = auditInput.safeParse(input);
        const occurredAt = new Date((deps.now ?? (() => new Date()))());
        const expiresAt = new Date(occurredAt.getTime() + 30 * 86400_000);
        if (
          !parsed.success ||
          !Number.isFinite(expiresAt.getTime()) ||
          (parsed.data.grantId !== null && parsed.data.userId === null)
        )
          throw new McpPrivacyError();
        await deps.db.mcpAccessAudit.create({
          data: {
            ...parsed.data,
            requestId: randomUUID(),
            occurredAt,
            expiresAt,
          },
          select: { requestId: true },
        });
      });
    },
    purgeExpired(limit = 500) {
      return safe(async () => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new McpPrivacyError();
        const at = (deps.now ?? (() => new Date()))();
        if (!Number.isFinite(at.getTime())) throw new McpPrivacyError();
        return deps.db
          .$executeRaw`DELETE FROM "McpAccessAudit" WHERE "requestId" IN (SELECT "requestId" FROM "McpAccessAudit" WHERE "expiresAt" <= ${at} ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)`;
      });
    },
  };
}

export type McpAuditStore = ReturnType<typeof createMcpAuditStore>;
