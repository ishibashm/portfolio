import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { McpProviderStore } from "@/lib/mcpProviderStore";

export class McpConnectionError extends Error {
  constructor(
    public readonly code:
      | "LOGIN_REQUIRED"
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "TEMPORARILY_UNAVAILABLE",
  ) {
    super(code);
    this.name = "McpConnectionError";
  }
}

/** Dormant service: callers must obtain the subject from verified site login,
 * never a form field, MCP Bearer scope, email, or development bypass. */
export function createMcpConnectionService(deps: {
  db: Pick<PrismaClient, "mcpGrant">;
  store: Pick<McpProviderStore, "revokeByGrantId">;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  function subject(value: unknown): string {
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) throw new McpConnectionError("LOGIN_REQUIRED");
    return parsed.data;
  }
  function id(value: unknown): string {
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) throw new McpConnectionError("INVALID_REQUEST");
    return parsed.data;
  }
  async function safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof McpConnectionError) throw error;
      throw new McpConnectionError("TEMPORARILY_UNAVAILABLE");
    }
  }
  return {
    list(user: unknown, after?: unknown) {
      return safe(async () => {
        const userId = subject(user);
        const cursor = after === undefined ? undefined : id(after);
        // Keyset pagination keeps every query bounded, including revoked history.
        // IDs are random UUIDs: ordering is stable, not a claim of creation order.
        const rows = await deps.db.mcpGrant.findMany({
          where: { userId, ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: "asc" },
          take: 101,
          select: {
            id: true,
            clientId: true,
            allowedProfileIds: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            lastUsedAt: true,
          },
        });
        const page = rows.slice(0, 100);
        const at = now();
        return {
          connections: page.map((row) => ({
            id: row.id,
            clientId: row.clientId,
            allowedProfileIds: [...row.allowedProfileIds],
            scope: "read:profiles" as const,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
            lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
            status: row.revokedAt
              ? ("revoked" as const)
              : row.expiresAt <= at
                ? ("expired" as const)
                : ("active" as const),
          })),
          nextCursor: rows.length > 100 ? page[99].id : null,
        };
      });
    },
    revoke(user: unknown, connection: unknown) {
      return safe(async () => {
        const userId = subject(user);
        const connectionId = id(connection);
        const row = await deps.db.mcpGrant.findFirst({
          where: { id: connectionId, userId },
          select: { id: true, providerGrantId: true },
        });
        if (!row) throw new McpConnectionError("NOT_FOUND");
        // Commit application denial first. Even if protocol cleanup fails, the
        // RS and token store reject this consent; retries finish cleanup safely.
        await deps.db.mcpGrant.updateMany({
          where: { id: connectionId, userId, revokedAt: null },
          data: { revokedAt: now() },
        });
        await deps.store.revokeByGrantId(row.providerGrantId);
        return { revoked: true as const };
      });
    },
  };
}
