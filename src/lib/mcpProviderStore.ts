import type { McpProviderState, Prisma, PrismaClient } from "@prisma/client";
import { McpStateError } from "@/lib/mcpStateCrypto";

export type McpStateRow = McpProviderState;
type Transaction = Prisma.TransactionClient;

/** Inject a server-only client with query/error logging disabled. Never opens a DB. */
export function createMcpProviderStore(deps: {
  db: Pick<PrismaClient, "$transaction" | "mcpProviderState" | "$executeRaw">;
  grantKeyHash: (grantId: string) => string;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const key = (model: string, keyHash: string) => ({
    model_keyHash: { model, keyHash },
  });
  async function safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch {
      throw new McpStateError();
    }
  }
  // All grant writes/revocations use the same transaction-scoped lock across AS
  // workers. A hash collision only serializes unrelated grants; it cannot mix data.
  async function lock(tx: Transaction, grantId: string) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`mcp-grant:${grantId}`}, 0))`;
  }
  async function revoke(tx: Transaction, grantId: string, at: Date) {
    // Retain the provider Grant as a tombstone until its original expiry, so an
    // in-flight save cannot recreate it after revocation.
    await tx.mcpProviderState.updateMany({
      where: {
        model: "Grant",
        keyHash: deps.grantKeyHash(grantId),
        consumedAt: null,
      },
      data: { consumedAt: at },
    });
    await tx.mcpGrant.updateMany({
      where: { providerGrantId: grantId, revokedAt: null },
      data: { revokedAt: at },
    });
    await tx.mcpProviderState.deleteMany({
      where: { grantId, model: { not: "Grant" } },
    });
  }
  async function liveGrant(tx: Transaction, grantId: string, at: Date) {
    const grant = await tx.mcpProviderState.findUnique({
      where: key("Grant", deps.grantKeyHash(grantId)),
    });
    return !!grant && !grant.consumedAt && grant.expiresAt > at;
  }

  return {
    put(row: McpStateRow) {
      return safe(() =>
        deps.db.$transaction(async (tx) => {
          if (row.grantId) await lock(tx, row.grantId);
          const at = now();
          if (row.expiresAt <= at || row.consumedAt) throw new McpStateError();
          if (
            row.grantId &&
            row.model !== "Grant" &&
            !(await liveGrant(tx, row.grantId, at))
          )
            throw new McpStateError();
          const where = key(row.model, row.keyHash);
          const previous = await tx.mcpProviderState.findUnique({ where });
          if (
            previous &&
            (previous.grantId !== row.grantId ||
              previous.expiresAt <= at ||
              (row.model === "Grant" && previous.consumedAt))
          )
            throw new McpStateError();
          // consumedAt is NEVER reset by provider upsert (including interaction save).
          const { consumedAt: _consumedAt, ...update } = row;
          void _consumedAt;
          await tx.mcpProviderState.upsert({ where, create: row, update });
        }),
      );
    },
    find(
      model: string,
      selector:
        | { keyHash: string }
        | { uidHash: string }
        | { userCodeHash: string },
    ) {
      return safe(async () => {
        const row = await deps.db.mcpProviderState.findFirst({
          where: { model, ...selector, expiresAt: { gt: now() } },
        });
        if (
          !row ||
          row.expiresAt <= now() ||
          (model === "Grant" && row.consumedAt)
        )
          return undefined;
        return row;
      });
    },
    consume(model: string, keyHash: string) {
      return safe(() =>
        deps.db.$transaction(async (tx) => {
          const where = key(model, keyHash);
          const row = await tx.mcpProviderState.findUnique({ where });
          if (!row) return false;
          if (row.grantId) await lock(tx, row.grantId);
          const at = now();
          if (row.grantId && !(await liveGrant(tx, row.grantId, at)))
            return false;
          const result = await tx.mcpProviderState.updateMany({
            where: { model, keyHash, consumedAt: null, expiresAt: { gt: at } },
            data: { consumedAt: at },
          });
          if (result.count === 1) return true;
          // Commit revocation BEFORE the adapter throws invalid_grant. Throwing in
          // this transaction would roll it back and keep the stolen grant alive.
          if (row.grantId) await revoke(tx, row.grantId, at);
          return false;
        }),
      );
    },
    destroy(model: string, keyHash: string, grantId?: string) {
      return safe(async () => {
        if (model === "Grant") {
          if (!grantId || deps.grantKeyHash(grantId) !== keyHash)
            throw new McpStateError();
          await deps.db.$transaction(async (tx) => {
            await lock(tx, grantId);
            await revoke(tx, grantId, now());
          });
        } else {
          await deps.db.mcpProviderState.deleteMany({
            where: { model, keyHash },
          });
        }
      });
    },
    revokeByGrantId(grantId: string) {
      return safe(() =>
        deps.db.$transaction(async (tx) => {
          await lock(tx, grantId);
          await revoke(tx, grantId, now());
        }),
      );
    },
    claim(row: McpStateRow) {
      return safe(async () => {
        const remaining = row.expiresAt.getTime() - now().getTime();
        if (
          row.model !== "InteractionClaim" ||
          row.grantId ||
          remaining <= 0 ||
          remaining > 600_000
        )
          throw new McpStateError();
        // A separate primary key survives Interaction upsert/destroy. A unique
        // INSERT wins once across workers and tickets; never use read-then-write.
        const result = await deps.db.mcpProviderState.createMany({
          data: [row],
          skipDuplicates: true,
        });
        return result.count === 1;
      });
    },
    purgeExpired(limit = 500) {
      return safe(async () => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new McpStateError();
        const at = now();
        return deps.db
          .$executeRaw`DELETE FROM "McpProviderState" WHERE ("model", "keyHash") IN (SELECT "model", "keyHash" FROM "McpProviderState" WHERE "expiresAt" <= ${at} ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)`;
      });
    },
  };
}

export type McpProviderStore = ReturnType<typeof createMcpProviderStore>;
