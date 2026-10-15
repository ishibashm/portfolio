import type { McpAuditStore } from "@/lib/mcpAuditStore";
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
  audit?: Pick<McpAuditStore, "record">;
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
        const started = performance.now();
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
        await deps.audit?.record({
          userId,
          grantId: connectionId,
          event: "revoke",
          result: "revoked",
          durationMs: Math.floor(performance.now() - started),
        });
        return { revoked: true as const };
      });
    },
    revokeAll(user: unknown) {
      return safe(async () => {
        const started = performance.now();
        const userId = subject(user);
        const at = now();
        // One database statement denies all existing consents before any slow
        // protocol cleanup. A fresh consent after this operation is independent.
        await deps.db.mcpGrant.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: at },
        });
        // Include previously revoked rows so a failed cleanup is retryable.
        // Keyset pages bound memory; denial does not depend on finishing the loop.
        let cursor: string | undefined;
        for (;;) {
          const rows = await deps.db.mcpGrant.findMany({
            where: {
              userId,
              revokedAt: { lte: at },
              ...(cursor ? { id: { gt: cursor } } : {}),
            },
            orderBy: { id: "asc" },
            take: 100,
            select: { id: true, providerGrantId: true },
          });
          for (const row of rows)
            await deps.store.revokeByGrantId(row.providerGrantId);
          if (rows.length < 100) break;
          cursor = rows[rows.length - 1].id;
        }
        await deps.audit?.record({
          userId,
          grantId: null,
          event: "revoke",
          result: "revoked",
          durationMs: Math.floor(performance.now() - started),
        });
        return { revoked: true as const };
      });
    },
    reduceProfiles(user: unknown, connection: unknown, profiles: unknown) {
      return safe(async () => {
        const userId = subject(user);
        const connectionId = id(connection);
        const parsed = z
          .array(z.string().min(1).max(512))
          .min(1)
          .max(100)
          .safeParse(profiles);
        if (!parsed.success || new Set(parsed.data).size !== parsed.data.length)
          throw new McpConnectionError("INVALID_REQUEST");
        const at = now();
        const row = await deps.db.mcpGrant.findFirst({
          where: {
            id: connectionId,
            userId,
            revokedAt: null,
            createdAt: { lte: at },
            expiresAt: { gt: at },
          },
          select: { allowedProfileIds: true },
        });
        if (!row) throw new McpConnectionError("NOT_FOUND");
        if (
          parsed.data.some(
            (profile) => !row.allowedProfileIds.includes(profile),
          )
        )
          throw new McpConnectionError("INVALID_REQUEST");
        // Compare-and-swap prevents a stale tab from restoring a profile that
        // another request just removed. Additions always require fresh consent.
        const result = await deps.db.mcpGrant.updateMany({
          where: {
            id: connectionId,
            userId,
            revokedAt: null,
            expiresAt: { gt: now() },
            allowedProfileIds: { equals: row.allowedProfileIds },
          },
          data: { allowedProfileIds: parsed.data },
        });
        if (result.count !== 1) throw new McpConnectionError("INVALID_REQUEST");
        return { updated: true as const };
      });
    },
  };
}
