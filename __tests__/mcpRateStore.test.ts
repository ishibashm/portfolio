import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createMcpRateStore } from "@/lib/mcpRateStore";

const userId = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const start = Date.parse("2026-10-12T00:00:00Z");

// Deterministic SQL test double. This exercises callers and contention decisions,
// not PostgreSQL's lock implementation or SQL execution. Real DB tests remain a
// release prerequisite; migrations are never applied by this suite.
function setup() {
  let time = start;
  let tail = Promise.resolve();
  const buckets = new Map<string, { tokens: number; at: number }>();
  const leases = new Map<string, { requestId: string; until: number }>();
  const query = vi.fn(
    async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?");
      if (text.includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
      if (text.includes("SELECT clock_timestamp"))
        return [{ at: new Date(time) }];
      if (text.includes('INSERT INTO "McpRateBucket"')) {
        const [user, category, initial] = values;
        const key = `${user}:${category}`;
        const capacity = Number(initial) + 1;
        const rate = category === "request" ? 1 : 1 / 3;
        const old = buckets.get(key);
        const available = old
          ? Math.min(
              capacity,
              old.tokens + (Math.max(0, time - old.at) / 1000) * rate,
            )
          : capacity;
        if (available < 1) return [];
        buckets.set(key, {
          tokens: available - 1,
          at: Math.max(time, old?.at ?? time),
        });
        return [{ userId: user }];
      }
      if (text.includes('INSERT INTO "McpCalculationLease"')) {
        const [user, slot, requestId] = values;
        const key = `${user}:${slot}`;
        if ((leases.get(key)?.until ?? 0) > time) return [];
        leases.set(key, { requestId: String(requestId), until: time + 30_000 });
        return [{ slot }];
      }
      throw new Error("unexpected query");
    },
  );
  const db = {
    $transaction: vi.fn(
      (run: (tx: { $queryRaw: typeof query }) => Promise<unknown>) => {
        const result = tail.then(() => run({ $queryRaw: query }));
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
    mcpCalculationLease: {
      deleteMany: vi.fn(
        async ({ where }: { where: { userId: string; requestId: string } }) => {
          for (const [key, lease] of leases) {
            if (
              key.startsWith(`${where.userId}:`) &&
              lease.requestId === where.requestId
            )
              leases.delete(key);
          }
          return { count: 1 };
        },
      ),
    },
    $executeRaw: vi.fn().mockResolvedValue(2),
  };
  const store = createMcpRateStore({ db: db as unknown as PrismaClient });
  const reserve = (
    timeCalculation = false,
    user = userId,
    requestId = randomUUID(),
  ) => store.reserve({ userId: user, requestId, timeCalculation });
  return {
    db,
    store,
    query,
    reserve,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("MCP shared rate store (model and parameterized query contracts)", () => {
  it("allows burst 10 across instances and connections, then refills one request each second", async () => {
    const { db, reserve, advance } = setup();
    const second = createMcpRateStore({ db: db as unknown as PrismaClient });
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        i % 2
          ? reserve()
          : second.reserve({
              userId,
              requestId: randomUUID(),
              timeCalculation: false,
            }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed)).toEqual(
      Array(20).fill({ allowed: false, retryAfterSeconds: 1 }),
    );
    expect((await reserve(false, other)).allowed).toBe(true);
    advance(999);
    expect((await reserve()).allowed).toBe(false);
    advance(1);
    expect((await reserve()).allowed).toBe(true);
    expect((await reserve()).allowed).toBe(false);
    advance(-1000);
    expect((await reserve()).allowed).toBe(false);
    advance(1000);
    expect((await reserve()).allowed).toBe(false);
  });

  it("limits time calls separately to 20/minute refill without changing the request bucket", async () => {
    const { reserve, store, advance } = setup();
    let accepted = 0;
    let denied = 0;
    // 30 calls in three request bursts over 20 seconds: time bucket has 26 tokens.
    for (let burst = 0; burst < 3; burst++) {
      for (let i = 0; i < 10; i++) {
        const id = randomUUID();
        const result = await reserve(true, userId, id);
        if (result.allowed) {
          accepted++;
          await store.release(userId, id);
        } else {
          denied++;
          expect(result.retryAfterSeconds).toBe(3);
        }
      }
      if (burst < 2) advance(10_000);
    }
    expect(accepted).toBe(26);
    expect(denied).toBe(4);
  });

  it("holds at most two leases per user, expires crashed workers and protects replacement leases", async () => {
    const { reserve, store, advance, db } = setup();
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const results = await Promise.all(
      ids.map((id) => reserve(true, userId, id)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(2);
    expect(results[2]).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect((await reserve(true, other)).allowed).toBe(true);
    await store.release(other, ids[0]);
    expect((await reserve(true)).allowed).toBe(false);
    advance(29_999);
    expect((await reserve(true)).allowed).toBe(false);
    advance(1);
    expect((await reserve(true)).allowed).toBe(true);
    expect((await reserve(true)).allowed).toBe(true);
    await store.release(userId, ids[0]);
    expect((await reserve(true)).allowed).toBe(false);
    expect(db.mcpCalculationLease.deleteMany).toHaveBeenLastCalledWith({
      where: { userId, requestId: ids[0] },
    });
  });

  it("locks by user, uses the DB clock after the lock, parameterizes atomic updates and bounds transactions", async () => {
    const { reserve, query, db } = setup();
    await reserve(true);
    const calls = query.mock.calls;
    expect(calls[0][0].join("?")).toContain("pg_advisory_xact_lock");
    expect(calls[0][1]).toBe(`mcp-rate:${userId}`);
    expect(calls[1][0].join("?")).toContain("clock_timestamp()");
    const bucket = calls[2][0].join("?");
    expect(bucket).toContain('ON CONFLICT ("userId", "category") DO UPDATE');
    expect(bucket).toContain("WHERE LEAST");
    expect(bucket).toContain("GREATEST(0, EXTRACT");
    expect(bucket).toContain("interval '120 seconds'");
    const lease = calls[4][0].join("?");
    expect(lease).toContain('WHERE "McpCalculationLease"."expiresAt" <= ?');
    expect(lease).toContain("interval '30 seconds'");
    for (const call of calls) expect(call[0].join("?")).not.toContain(userId);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 1000,
      timeout: 2000,
      isolationLevel: "ReadCommitted",
    });
  });

  it("rejects malformed input and DB failures without bypass, logs or raw causes", async () => {
    const { store, db, query, reserve } = setup();
    await expect(
      store.reserve({
        userId: "private-token",
        requestId: randomUUID(),
        timeCalculation: false,
      }),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(db.$transaction).not.toHaveBeenCalled();
    const spy = vi.spyOn(console, "error");
    try {
      query.mockRejectedValueOnce(new Error("private-birth private-token"));
      const error = await reserve().catch((e: Error) => e);
      expect(error).toMatchObject({ message: "TEMPORARILY_UNAVAILABLE" });
      expect(error).not.toHaveProperty("cause");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    await expect(store.release(userId, "bad")).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(db.mcpCalculationLease.deleteMany).not.toHaveBeenCalled();
  });

  it("purges only expired buckets/leases with bounded skip-locked SQL and no automatic job", async () => {
    const { store, db } = setup();
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(await store.purgeExpired(7)).toEqual({ buckets: 2, leases: 2 });
    for (const [sql, limit] of db.$executeRaw.mock.calls) {
      expect(sql.join("?")).toContain('"expiresAt" <= clock_timestamp()');
      expect(sql.join("?")).toContain("LIMIT ? FOR UPDATE SKIP LOCKED");
      expect(limit).toBe(7);
    }
    await expect(store.purgeExpired(1001)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
