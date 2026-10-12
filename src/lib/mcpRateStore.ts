import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { McpPrivacyError } from "@/lib/mcpAuditStore";

const reservation = z.object({
  userId: z.uuid(),
  requestId: z.uuid(),
  timeCalculation: z.boolean(),
});
export type McpReservation = z.infer<typeof reservation>;
export type McpRateDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Dormant shared limiter. The caller supplies a server-only, non-logging DB.
 * Request bucket: burst 10, refill 60/minute. Time bucket: burst/refill 20/minute.
 * Denied time calls still spend the request token; busy calls spend both tokens.
 * Leases outlive the guard's 5s execution deadline, recovering crashes after 30s.
 */
export function createMcpRateStore(deps: {
  db: Pick<
    PrismaClient,
    "$transaction" | "mcpCalculationLease" | "$executeRaw"
  >;
}) {
  async function safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch {
      throw new McpPrivacyError();
    }
  }

  async function spend(
    tx: Prisma.TransactionClient,
    userId: string,
    at: Date,
    category: "request" | "time_calculation",
  ) {
    const capacity = category === "request" ? 10 : 20;
    const perSecond = category === "request" ? 1 : 1 / 3;
    // The conditional UPSERT is atomic even without the advisory lock. The
    // transaction lock also serializes the two buckets and lease reservation.
    // Backward clock movement never replenishes or rewinds the stored clock.
    const rows = await tx.$queryRaw<{ userId: string }[]>`
      INSERT INTO "McpRateBucket" ("userId", "category", "tokens", "updatedAt", "expiresAt")
      VALUES (${userId}::uuid, ${category}, ${capacity - 1}, ${at}, ${at}::timestamptz + interval '120 seconds')
      ON CONFLICT ("userId", "category") DO UPDATE SET
        "tokens" = LEAST(${capacity}, "McpRateBucket"."tokens" + GREATEST(0, EXTRACT(EPOCH FROM (${at}::timestamptz - "McpRateBucket"."updatedAt"))) * ${perSecond}) - 1,
        "updatedAt" = GREATEST("McpRateBucket"."updatedAt", ${at}),
        "expiresAt" = GREATEST("McpRateBucket"."updatedAt", ${at}) + interval '120 seconds'
      WHERE LEAST(${capacity}, "McpRateBucket"."tokens" + GREATEST(0, EXTRACT(EPOCH FROM (${at}::timestamptz - "McpRateBucket"."updatedAt"))) * ${perSecond}) >= 1
      RETURNING "userId"`;
    return rows.length === 1;
  }

  return {
    reserve(input: McpReservation): Promise<McpRateDecision> {
      return safe(async () => {
        const parsed = reservation.safeParse(input);
        if (!parsed.success) throw new McpPrivacyError();
        const { userId, requestId, timeCalculation } = parsed.data;
        return deps.db.$transaction(
          async (tx): Promise<McpRateDecision> => {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`mcp-rate:${userId}`}, 0))`;
            // Use the database clock AFTER lock acquisition, not an instance clock
            // or transaction-start timestamp that gets stale waiting for a lock.
            const [clock] = await tx.$queryRaw<
              { at: Date }[]
            >`SELECT clock_timestamp() AS "at"`;
            if (!clock || !Number.isFinite(clock.at?.getTime()))
              throw new McpPrivacyError();
            const at = clock.at;
            if (!(await spend(tx, userId, at, "request")))
              return { allowed: false, retryAfterSeconds: 1 };
            if (!timeCalculation) return { allowed: true };
            if (!(await spend(tx, userId, at, "time_calculation")))
              return { allowed: false, retryAfterSeconds: 3 };
            for (const slot of [0, 1]) {
              const rows = await tx.$queryRaw<{ slot: number }[]>`
                INSERT INTO "McpCalculationLease" ("userId", "slot", "requestId", "expiresAt")
                VALUES (${userId}::uuid, ${slot}, ${requestId}::uuid, ${at}::timestamptz + interval '30 seconds')
                ON CONFLICT ("userId", "slot") DO UPDATE SET
                  "requestId" = EXCLUDED."requestId", "expiresAt" = EXCLUDED."expiresAt"
                WHERE "McpCalculationLease"."expiresAt" <= ${at}
                RETURNING "slot"`;
              if (rows.length === 1) return { allowed: true };
            }
            return { allowed: false, retryAfterSeconds: 30 };
          },
          { maxWait: 1000, timeout: 2000, isolationLevel: "ReadCommitted" },
        );
      });
    },
    release(userId: string, requestId: string) {
      return safe(async () => {
        if (
          !z.uuid().safeParse(userId).success ||
          !z.uuid().safeParse(requestId).success
        )
          throw new McpPrivacyError();
        // An old completion must never delete a replacement lease in the slot.
        await deps.db.mcpCalculationLease.deleteMany({
          where: { userId, requestId },
        });
      });
    },
    purgeExpired(limit = 500) {
      return safe(async () => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new McpPrivacyError();
        const buckets = await deps.db
          .$executeRaw`DELETE FROM "McpRateBucket" WHERE ("userId", "category") IN (SELECT "userId", "category" FROM "McpRateBucket" WHERE "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)`;
        const leases = await deps.db
          .$executeRaw`DELETE FROM "McpCalculationLease" WHERE ("userId", "slot") IN (SELECT "userId", "slot" FROM "McpCalculationLease" WHERE "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)`;
        return { buckets, leases };
      });
    },
  };
}

export type McpRateStore = ReturnType<typeof createMcpRateStore>;
