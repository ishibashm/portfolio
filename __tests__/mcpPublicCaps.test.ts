import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = { ipHash: string; tokens: number; updatedAt: Date };

function createMemoryRateDb() {
  const buckets = new Map<string, Bucket>();
  const locks: string[] = [];
  const tx = {
    $queryRaw: vi.fn(
      async (_query: TemplateStringsArray, ...values: unknown[]) => {
        if (typeof values[0] === "string") locks.push(values[0]);
        return [];
      },
    ),
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
      deleteMany: vi.fn(
        async ({ where }: { where: { updatedAt: { lt: Date } } }) => {
          let count = 0;
          for (const [key, row] of buckets) {
            if (row.updatedAt < where.updatedAt.lt) {
              buckets.delete(key);
              count++;
            }
          }
          return { count };
        },
      ),
    },
  };
  const $transaction = vi.fn(
    async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => fn(tx),
  );
  const db: McpRateDb & {
    buckets: Map<string, Bucket>;
    locks: string[];
    tx: typeof tx;
    $transaction: typeof $transaction;
  } = {
    buckets,
    locks,
    tx,
    $transaction: $transaction as unknown as McpRateDb["$transaction"] &
      typeof $transaction,
  };
  return db;
}

const sharedDb = createMemoryRateDb();
vi.mock("@/lib/prisma", () => ({ default: sharedDb }));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { POST } from "@/app/api/mcp/route";
import { createMcpServer, MCP_PUBLIC_TOOL_NAMES } from "@/lib/mcpServer";
import {
  MCP_PUBLIC_ALLOWED_TOOLS,
  MCP_PUBLIC_GLOBAL_BURST,
  MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
  MCP_PUBLIC_IP_BURST,
  MCP_PUBLIC_IP_HOURLY_LIMIT,
  MCP_PUBLIC_MAX_TOOL_BUCKETS,
  MCP_PUBLIC_SESSION_BURST,
  MCP_PUBLIC_SESSION_HOURLY_LIMIT,
  MCP_PUBLIC_TOOL_BURST,
  MCP_PUBLIC_TOOL_HOURLY_LIMIT,
  buildMcpPublicBuckets,
  checkMcpPublicLimit,
  extractMcpToolNames,
  mcpIpHash,
  mcpPublicScopeLimits,
  type McpRateDb,
} from "@/lib/mcpPublicLimit";

const now = new Date("2026-11-01T00:00:00.000Z");

beforeEach(() => {
  sharedDb.buckets.clear();
  sharedDb.locks.length = 0;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MCP public multi-scope caps", () => {
  it("parses default and overridden limits for ip, global, session, and tool", () => {
    expect(mcpPublicScopeLimits({})).toEqual({
      ip: { hourly: MCP_PUBLIC_IP_HOURLY_LIMIT, burst: MCP_PUBLIC_IP_BURST },
      global: {
        hourly: MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
        burst: MCP_PUBLIC_GLOBAL_BURST,
      },
      session: {
        hourly: MCP_PUBLIC_SESSION_HOURLY_LIMIT,
        burst: MCP_PUBLIC_SESSION_BURST,
      },
      tool: {
        hourly: MCP_PUBLIC_TOOL_HOURLY_LIMIT,
        burst: MCP_PUBLIC_TOOL_BURST,
      },
    });
    expect(
      mcpPublicScopeLimits({
        MCP_PUBLIC_GLOBAL_HOURLY_LIMIT: "bad",
        MCP_PUBLIC_SESSION_BURST: "0",
        MCP_PUBLIC_TOOL_HOURLY_LIMIT: "50",
        MCP_PUBLIC_TOOL_BURST: "999",
      }),
    ).toMatchObject({
      global: {
        hourly: MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
        burst: MCP_PUBLIC_GLOBAL_BURST,
      },
      session: {
        hourly: MCP_PUBLIC_SESSION_HOURLY_LIMIT,
        burst: MCP_PUBLIC_SESSION_BURST,
      },
      tool: { hourly: 50, burst: 50 },
    });
  });

  it("enforces global, session, and tool caps and acquires advisory locks in sorted key order", async () => {
    const db = createMemoryRateDb();
    vi.stubEnv("MCP_PUBLIC_GLOBAL_BURST", "2");
    const h1 = new Headers({
      "x-real-ip": "198.51.100.1",
      "mcp-session-id": " sess-1 ",
    });
    const h2 = new Headers({
      "x-real-ip": "198.51.100.2",
      "mcp-session-id": "sess-2",
    });
    const h3 = new Headers({
      "x-real-ip": "198.51.100.3",
      "mcp-session-id": "sess-3",
    });
    const toolBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_honmei_star",
        arguments: { birthDate: "1990-05-05" },
      },
    };

    expect(
      (await checkMcpPublicLimit(h1, now, toolBody, db)).denied,
    ).toBeNull();
    // Verify sorted lock order inside the single transaction
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.locks).toEqual([...db.locks].sort());
    expect(db.buckets.has(mcpIpHash("global:v1"))).toBe(true);
    expect(db.buckets.has(mcpIpHash("session:sess-1"))).toBe(true);
    expect(db.buckets.has(mcpIpHash("tool:get_honmei_star"))).toBe(true);

    expect(
      (await checkMcpPublicLimit(h2, now, toolBody, db)).denied,
    ).toBeNull();
    const globalDenied = await checkMcpPublicLimit(h3, now, toolBody, db);
    expect(globalDenied.denied?.status).toBe(429);
    expect(await globalDenied.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "global",
    });
  });

  it("enforces session cap only for valid mcp-session-id (<=200 chars) and tool cap for batch arrays", async () => {
    const db = createMemoryRateDb();
    vi.stubEnv("MCP_PUBLIC_SESSION_BURST", "1");
    vi.stubEnv("MCP_PUBLIC_TOOL_BURST", "1");

    const sessionHeaders = new Headers({
      "x-real-ip": "198.51.100.10",
      "mcp-session-id": "valid-session",
    });
    expect(
      (await checkMcpPublicLimit(sessionHeaders, now, undefined, db)).denied,
    ).toBeNull();
    const sessionDenied = await checkMcpPublicLimit(
      sessionHeaders,
      now,
      undefined,
      db,
    );
    expect(sessionDenied.denied?.status).toBe(429);
    expect(await sessionDenied.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "session",
    });

    // Overlong session id (>200 chars) is ignored
    const longSessionHeaders = new Headers({
      "x-real-ip": "198.51.100.11",
      "mcp-session-id": "s".repeat(201),
    });
    expect(
      (await checkMcpPublicLimit(longSessionHeaders, now, undefined, db))
        .denied,
    ).toBeNull();
    expect(
      (await checkMcpPublicLimit(longSessionHeaders, now, undefined, db))
        .denied,
    ).toBeNull();

    // Batch array with tools/call and dirty/unknown tool name mapped to shared tool:unknown
    const batchBody = [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_kanshi$bad!" },
      },
    ];
    const toolHeaders = new Headers({ "x-real-ip": "198.51.100.12" });
    expect(
      (await checkMcpPublicLimit(toolHeaders, now, batchBody, db)).denied,
    ).toBeNull();
    expect(db.buckets.has(mcpIpHash("tool:unknown"))).toBe(true);
    expect(db.buckets.has(mcpIpHash("tool:get_kanshibad"))).toBe(false);

    const toolDenied = await checkMcpPublicLimit(
      toolHeaders,
      now,
      batchBody,
      db,
    );
    expect(toolDenied.denied?.status).toBe(429);
    expect(await toolDenied.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "tool",
    });
  });

  it("does not consume other buckets when one bucket is denied", async () => {
    const db = createMemoryRateDb();
    vi.stubEnv("MCP_PUBLIC_IP_BURST", "10");
    vi.stubEnv("MCP_PUBLIC_GLOBAL_BURST", "10");
    vi.stubEnv("MCP_PUBLIC_TOOL_BURST", "1");

    const headers = new Headers({ "x-real-ip": "198.51.100.50" });
    const callBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "judge_directions" },
    };

    // First call consumes 1 token from IP (10 -> 9), global (10 -> 9), tool (1 -> 0)
    expect(
      (await checkMcpPublicLimit(headers, now, callBody, db)).denied,
    ).toBeNull();
    expect(db.buckets.get(mcpIpHash("198.51.100.50"))?.tokens).toBe(9);
    expect(db.buckets.get(mcpIpHash("global:v1"))?.tokens).toBe(9);
    expect(db.buckets.get(mcpIpHash("tool:judge_directions"))?.tokens).toBe(0);

    db.tx.mcpPublicRate.upsert.mockClear();

    // Second call is denied by tool bucket; IP and global must remain at 9
    const second = await checkMcpPublicLimit(headers, now, callBody, db);
    expect(second.denied?.status).toBe(429);
    expect(await second.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "tool",
    });
    expect(db.tx.mcpPublicRate.upsert).not.toHaveBeenCalled();
    expect(db.buckets.get(mcpIpHash("198.51.100.50"))?.tokens).toBe(9);
    expect(db.buckets.get(mcpIpHash("global:v1"))?.tokens).toBe(9);
  });

  it("returns headers for the most restrictive bucket (smallest remaining)", async () => {
    const db = createMemoryRateDb();
    vi.stubEnv("MCP_PUBLIC_IP_HOURLY_LIMIT", "2000");
    vi.stubEnv("MCP_PUBLIC_IP_BURST", "200");
    vi.stubEnv("MCP_PUBLIC_SESSION_HOURLY_LIMIT", "500");
    vi.stubEnv("MCP_PUBLIC_SESSION_BURST", "15");
    vi.stubEnv("MCP_PUBLIC_TOOL_HOURLY_LIMIT", "300");
    vi.stubEnv("MCP_PUBLIC_TOOL_BURST", "5");

    const headers = new Headers({
      "x-real-ip": "198.51.100.77",
      "mcp-session-id": "s-restrictive",
    });
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search_rentals" },
    };

    const gate = await checkMcpPublicLimit(headers, now, body, db);
    expect(gate.denied).toBeNull();
    // Tool bucket has burst 5 -> remaining 4 (most restrictive)
    expect(gate.headers.get("RateLimit-Limit")).toBe("300");
    expect(gate.headers.get("RateLimit-Remaining")).toBe("4");
  });

  it("emits RateLimit-Policy: unavailable and structured WARNING log without secrets on fail-open", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createMemoryRateDb();
    db.tx.$queryRaw.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Can't reach postgres://admin:super-secret-password@db.internal:5432/prod",
        ),
        { code: "P2021" },
      ),
    );

    const gate = await checkMcpPublicLimit(
      new Headers({ "x-real-ip": "198.51.100.88" }),
      now,
      undefined,
      db,
    );
    expect(gate.denied).toBeNull();
    expect(gate.headers.get("RateLimit-Policy")).toBe("unavailable");
    expect(gate.headers.get("Cache-Control")).toBe("no-store");
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(JSON.parse(logged)).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable",
      reason: "P2021",
    });
    expect(logged).not.toContain("super-secret-password");
    expect(logged).not.toContain("postgres://");

    // Also test timeout fail-open
    warn.mockClear();
    vi.useFakeTimers();
    db.$transaction.mockImplementationOnce(() => new Promise(() => {}));
    const pending = checkMcpPublicLimit(
      new Headers({ "x-real-ip": "198.51.100.89" }),
      now,
      undefined,
      db,
    );
    await vi.advanceTimersByTimeAsync(1500);
    const timeoutGate = await pending;
    expect(timeoutGate.denied).toBeNull();
    expect(timeoutGate.headers.get("RateLimit-Policy")).toBe("unavailable");
    expect(timeoutGate.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable",
      reason: "timeout",
    });
  });

  it("applies tool rate limit after reading JSON in POST /api/mcp", async () => {
    vi.stubEnv("MCP_PUBLIC_TOOL_BURST", "1");
    const makeReq = () =>
      new Request("https://cloud-palette.com/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-real-ip": "198.51.100.99",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_honmei_star",
            arguments: { birthDate: "1990-05-05" },
          },
        }),
      });

    const first = await POST(makeReq());
    expect(first.status).toBe(200);
    const second = await POST(makeReq());
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({
      error: "Too many requests",
      scope: "tool",
    });
  });

  it("keeps the tool allow-list in sync with tools registered on createMcpServer()", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientTransport);
    try {
      const registered = (await client.listTools()).tools
        .map((t) => t.name)
        .sort();
      expect([...MCP_PUBLIC_TOOL_NAMES].sort()).toEqual(registered);
      expect([...MCP_PUBLIC_ALLOWED_TOOLS].sort()).toEqual(registered);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("maps unknown tool names to one shared tool:unknown bucket while giving known names individual buckets", async () => {
    const db = createMemoryRateDb();
    vi.stubEnv("MCP_PUBLIC_TOOL_BURST", "1");
    const headers = new Headers({ "x-real-ip": "198.51.100.101" });

    // First unknown tool name consumes the shared tool:unknown token
    const unknownA = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "invented_tool_alpha" },
    };
    expect(
      (await checkMcpPublicLimit(headers, now, unknownA, db)).denied,
    ).toBeNull();
    expect(db.buckets.has(mcpIpHash("tool:unknown"))).toBe(true);
    expect(db.buckets.has(mcpIpHash("tool:invented_tool_alpha"))).toBe(false);

    // A different unknown tool name shares tool:unknown and is rate-limited
    const unknownB = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "invented_tool_beta" },
    };
    const deniedUnknown = await checkMcpPublicLimit(headers, now, unknownB, db);
    expect(deniedUnknown.denied?.status).toBe(429);
    expect(await deniedUnknown.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "tool",
    });
    expect(db.buckets.has(mcpIpHash("tool:invented_tool_beta"))).toBe(false);

    // Known tool names still get their own individual buckets and are unaffected by tool:unknown exhaustion
    const knownBatch = [
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_kanshi" },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "search_municipality" },
      },
    ];
    expect(
      (await checkMcpPublicLimit(headers, now, knownBatch, db)).denied,
    ).toBeNull();
    expect(db.buckets.has(mcpIpHash("tool:get_kanshi"))).toBe(true);
    expect(db.buckets.has(mcpIpHash("tool:search_municipality"))).toBe(true);
  });

  it("produces at most 2 + 1 + 1 buckets for a batch with 100 distinct random tool names and caps known tool buckets at 8 plus tool:unknown", async () => {
    const randomBatch = Array.from({ length: 100 }, (_, i) => ({
      jsonrpc: "2.0",
      id: i + 1,
      method: "tools/call",
      params: { name: `random_unregistered_tool_${i}_${Math.random()}` },
    }));

    const headersNoSession = new Headers({ "x-real-ip": "198.51.100.102" });
    const bucketsNoSession = buildMcpPublicBuckets(
      headersNoSession,
      randomBatch,
      {},
    );
    expect(bucketsNoSession.map((b) => b.scope)).toEqual([
      "ip",
      "global",
      "tool",
    ]);
    expect(bucketsNoSession).toHaveLength(2 + 0 + 1);

    const db = createMemoryRateDb();
    const headersWithSession = new Headers({
      "x-real-ip": "198.51.100.102",
      "mcp-session-id": "sess-batch-100",
    });
    const bucketsWithSession = buildMcpPublicBuckets(
      headersWithSession,
      randomBatch,
      {},
    );
    // 2 (ip, global) + 1 (session) + 1 (tool:unknown) = 4 buckets
    expect(bucketsWithSession).toHaveLength(2 + 1 + 1);
    expect(bucketsWithSession.map((b) => b.scope)).toEqual([
      "ip",
      "global",
      "session",
      "tool",
    ]);
    expect(
      (await checkMcpPublicLimit(headersWithSession, now, randomBatch, db))
        .denied,
    ).toBeNull();
    expect(db.buckets.size).toBe(4);
    expect(db.locks).toHaveLength(4);
    expect(db.buckets.has(mcpIpHash("tool:unknown"))).toBe(true);

    // Dedupe + cap at 8 known tools per request; overflow counts against tool:unknown
    const manyKnownBatch = [
      // Duplicate references to the first tool should dedupe
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: MCP_PUBLIC_TOOL_NAMES[0] },
      },
      ...MCP_PUBLIC_TOOL_NAMES.slice(0, 12).map((name, idx) => ({
        jsonrpc: "2.0",
        id: idx + 2,
        method: "tools/call",
        params: { name },
      })),
    ];
    const extracted = extractMcpToolNames(manyKnownBatch);
    expect(extracted).toEqual([
      ...MCP_PUBLIC_TOOL_NAMES.slice(0, MCP_PUBLIC_MAX_TOOL_BUCKETS),
      "unknown",
    ]);
    const cappedBuckets = buildMcpPublicBuckets(
      headersWithSession,
      manyKnownBatch,
      {},
    );
    const toolBuckets = cappedBuckets.filter((b) => b.scope === "tool");
    expect(toolBuckets).toHaveLength(MCP_PUBLIC_MAX_TOOL_BUCKETS + 1);
    expect(toolBuckets.map((b) => b.key)).toEqual([
      ...MCP_PUBLIC_TOOL_NAMES.slice(0, MCP_PUBLIC_MAX_TOOL_BUCKETS).map((n) =>
        mcpIpHash(`tool:${n}`, {}),
      ),
      mcpIpHash("tool:unknown", {}),
    ]);
  });
});
