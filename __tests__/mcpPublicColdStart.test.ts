import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = { ipHash: string; tokens: number; updatedAt: Date };

const buckets = new Map<string, Bucket>();
const tx = {
  $queryRaw: vi.fn(async () => [{ locked: 1 }]),
  mcpPublicRate: {
    findUnique: vi.fn(async ({ where }: { where: { ipHash: string } }) => {
      const found = buckets.get(where.ipHash);
      return found ? { ...found } : null;
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { ipHash: string };
        create: Bucket;
        update: { tokens: number; updatedAt: Date };
      }) => {
        const prev = buckets.get(where.ipHash);
        const row = prev
          ? { ...prev, ...update, ipHash: where.ipHash }
          : { ...create };
        buckets.set(where.ipHash, row);
        return row;
      },
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
};

const prismaMock = {
  $queryRaw: vi.fn<
    (query?: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
  >(async () => [{ ok: 1 }]),
  $transaction: vi.fn(async <T>(fn: (client: typeof tx) => Promise<T>) =>
    fn(tx),
  ),
};

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { POST } from "@/app/api/mcp/route";
import {
  MCP_PUBLIC_COLD_DB_TIMEOUT_MS,
  MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
  MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
  MCP_PUBLIC_DB_TIMEOUT_MS,
  MCP_PUBLIC_FALLBACK_LIMIT,
  MCP_PUBLIC_TX_MAX_WAIT_MS,
  MCP_PUBLIC_TX_TIMEOUT_MS,
  checkMcpPublicLimit,
  getMcpPublicFallbackBucket,
  isMcpRateDbWarm,
  maybeWarmMcpRateDb,
  resetMcpPublicRateState,
  shouldAutoWarmMcpRateDb,
  warmMcpRateDb,
} from "@/lib/mcpPublicLimit";

const now = new Date("2026-11-01T00:00:00.000Z");

beforeEach(() => {
  buckets.clear();
  resetMcpPublicRateState();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  prismaMock.$queryRaw.mockImplementation(async () => [{ ok: 1 }]);
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
  tx.$queryRaw.mockImplementation(async () => [{ locked: 1 }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MCP public rate limiter cold start and fallback", () => {
  it("cold path awaits in-flight warm-up and uses long maxWait/timeout, then warm path uses short values", async () => {
    const events: string[] = [];
    let resolveWarmup!: () => void;
    prismaMock.$queryRaw.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          events.push("warmup:start");
          resolveWarmup = () => {
            events.push("warmup:done");
            resolve([{ ok: 1 }]);
          };
        }),
    );
    prismaMock.$transaction.mockImplementation(async (fn) => {
      events.push("tx:start");
      return fn(tx);
    });

    const warmPromise = warmMcpRateDb();
    const headers = new Headers({ "x-real-ip": "198.51.100.10" });
    const firstPending = checkMcpPublicLimit(headers, now);

    // Transaction must wait until in-flight warm-up completes
    await vi.waitFor(() => {
      expect(events).toEqual(["warmup:start"]);
    });
    resolveWarmup();
    await warmPromise;

    const first = await firstPending;
    expect(first.denied).toBeNull();
    expect(events).toEqual(["warmup:start", "warmup:done", "tx:start"]);
    expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {
        maxWait: MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
        timeout: MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
        isolationLevel: "ReadCommitted",
      },
    );

    const second = await checkMcpPublicLimit(headers, now);
    expect(second.denied).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {
        maxWait: MCP_PUBLIC_TX_MAX_WAIT_MS,
        timeout: MCP_PUBLIC_TX_TIMEOUT_MS,
        isolationLevel: "ReadCommitted",
      },
    );
    expect(MCP_PUBLIC_COLD_DB_TIMEOUT_MS).toBe(3500);
    expect(MCP_PUBLIC_DB_TIMEOUT_MS).toBe(1500);
  });

  it("warm-up runs SELECT 1 once and is retried after failure with sanitized logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const queries: string[] = [];
    prismaMock.$queryRaw
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            "FATAL: password authentication failed for postgres://admin:topsecret@db.internal:5432/prod",
          ),
          { code: "P1000" },
        ),
      )
      .mockImplementation(async (q?: TemplateStringsArray) => {
        if (q) queries.push(q.join("?"));
        return [{ ok: 1 }];
      });

    expect(await warmMcpRateDb()).toBe(false);
    expect(isMcpRateDbWarm()).toBe(false);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const warnPayload = String(warn.mock.calls[0][0]);
    expect(JSON.parse(warnPayload)).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable: P1000",
      reason: "P1000",
    });
    expect(warnPayload).not.toContain("topsecret");

    // Retry after failure succeeds and is memoized
    const retryA = warmMcpRateDb();
    const retryB = warmMcpRateDb();
    expect(retryA).toBe(retryB);
    expect(await retryA).toBe(true);
    expect(isMcpRateDbWarm()).toBe(true);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(queries[0]).toContain("SELECT 1");

    expect(await warmMcpRateDb()).toBe(true);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("applies 60/min per-IP fallback bucket when DB throws in POST /api/mcp, returning 429 on 61st while another IP passes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    prismaMock.$transaction.mockRejectedValue(
      Object.assign(
        new Error("Transaction API error: Unable to start a transaction"),
        { code: "P2028" },
      ),
    );

    const makeReq = (ip: string) =>
      new Request("https://cloud-palette.com/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-real-ip": ip,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
          },
        }),
      });

    for (let i = 0; i < MCP_PUBLIC_FALLBACK_LIMIT; i++) {
      if (i === 0 || i === MCP_PUBLIC_FALLBACK_LIMIT - 1) {
        const res = await POST(makeReq("203.0.113.55"));
        expect(res.status).toBe(200);
        expect(res.headers.get("RateLimit-Policy")).toBe("fallback");
        expect(res.headers.get("RateLimit-Limit")).toBe("60");
        expect(res.headers.get("RateLimit-Remaining")).toBe(
          String(MCP_PUBLIC_FALLBACK_LIMIT - 1 - i),
        );
        expect(Number(res.headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
      } else {
        const gate = await checkMcpPublicLimit(
          new Headers({ "x-real-ip": "203.0.113.55" }),
        );
        expect(gate.denied).toBeNull();
        expect(gate.headers.get("RateLimit-Policy")).toBe("fallback");
        expect(gate.headers.get("RateLimit-Remaining")).toBe(
          String(MCP_PUBLIC_FALLBACK_LIMIT - 1 - i),
        );
      }
    }

    const sixtyFirst = await POST(makeReq("203.0.113.55"));
    expect(sixtyFirst.status).toBe(429);
    expect(sixtyFirst.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(sixtyFirst.headers.get("RateLimit-Limit")).toBe("60");
    expect(sixtyFirst.headers.get("RateLimit-Remaining")).toBe("0");
    expect(sixtyFirst.headers.get("Retry-After")).toBe("1");
    expect(sixtyFirst.headers.get("Cache-Control")).toBe("no-store");
    expect(await sixtyFirst.json()).toEqual({
      error: "Too many requests",
      scope: "fallback",
    });

    // Different IP still passes
    const otherIpRes = await POST(makeReq("203.0.113.56"));
    expect(otherIpRes.status).toBe(200);
    expect(otherIpRes.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(otherIpRes.headers.get("RateLimit-Limit")).toBe("60");
    expect(otherIpRes.headers.get("RateLimit-Remaining")).toBe("59");

    // Fallback bucket is shared on globalThis and refills at 1 token / 1000ms
    expect(getMcpPublicFallbackBucket()).toBe(
      (
        globalThis as typeof globalThis & {
          __mcpPublicRateState?: { fallbackBucket: unknown };
        }
      ).__mcpPublicRateState?.fallbackBucket,
    );
    const refilled = await checkMcpPublicLimit(
      new Headers({ "x-real-ip": "203.0.113.55" }),
      new Date(Date.now() + 1000),
    );
    expect(refilled.denied).toBeNull();
    expect(refilled.headers.get("RateLimit-Policy")).toBe("fallback");
  });

  it("does not start warm-up under NODE_ENV=test or build phase, and starts in nodejs production runtime", async () => {
    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "test",
        NEXT_RUNTIME: "nodejs",
      }),
    ).toBe(false);
    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "production",
        VITEST: "true",
        NEXT_RUNTIME: "nodejs",
      }),
    ).toBe(false);
    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        NEXT_RUNTIME: "nodejs",
      }),
    ).toBe(false);
    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "production",
        NEXT_RUNTIME: "edge",
      }),
    ).toBe(false);
    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
      }),
    ).toBe(true);

    const started = maybeWarmMcpRateDb({
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
    });
    expect(started).not.toBeNull();
    expect(await started).toBe(true);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("instrumentation register() does not import mcpPublicLimit when NEXT_RUNTIME is edge or unset, and fires warm-up without blocking in nodejs", async () => {
    vi.resetModules();
    const imported = vi.fn();
    const shouldAutoWarmMock = vi.fn(() => false);
    const warmMock = vi.fn(async () => true);
    vi.doMock("@/lib/mcpPublicLimit", () => {
      imported();
      return {
        shouldAutoWarmMcpRateDb: shouldAutoWarmMock,
        warmMcpRateDb: warmMock,
      };
    });

    try {
      const { register } = await import("@/instrumentation");

      // NEXT_RUNTIME unset
      delete process.env.NEXT_RUNTIME;
      await register();
      await Promise.resolve();
      expect(imported).not.toHaveBeenCalled();
      expect(shouldAutoWarmMock).not.toHaveBeenCalled();
      expect(warmMock).not.toHaveBeenCalled();

      // NEXT_RUNTIME = "edge"
      vi.stubEnv("NEXT_RUNTIME", "edge");
      await register();
      await Promise.resolve();
      expect(imported).not.toHaveBeenCalled();
      expect(shouldAutoWarmMock).not.toHaveBeenCalled();
      expect(warmMock).not.toHaveBeenCalled();

      // NEXT_RUNTIME = "nodejs" with shouldAutoWarmMcpRateDb() = false
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      shouldAutoWarmMock.mockReturnValueOnce(false);
      await register();
      await vi.waitFor(() => {
        expect(shouldAutoWarmMock).toHaveBeenCalledTimes(1);
      });
      expect(imported).toHaveBeenCalledTimes(1);
      expect(warmMock).not.toHaveBeenCalled();

      // NEXT_RUNTIME = "nodejs" with shouldAutoWarmMcpRateDb() = true (fire-and-forget)
      shouldAutoWarmMock.mockReturnValueOnce(true);
      warmMock.mockImplementationOnce(() => new Promise<boolean>(() => {}));
      await expect(register()).resolves.toBeUndefined();
      await vi.waitFor(() => {
        expect(warmMock).toHaveBeenCalledTimes(1);
      });
    } finally {
      vi.doUnmock("@/lib/mcpPublicLimit");
      vi.resetModules();
    }
  });
});
