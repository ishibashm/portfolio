import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = { ipHash: string; tokens: number; updatedAt: Date };

function createMemoryRateDb() {
  const buckets = new Map<string, Bucket>();
  const locks: string[] = [];
  const queries: string[] = [];
  const statements: { sql: string; values: unknown[] }[] = [];
  const runQueryRaw = async (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const sql = query.join("?");
    queries.push(sql);
    statements.push({ sql, values });
    if (/pg_advisory_xact_lock/i.test(sql)) {
      const list = Array.isArray(values[0])
        ? (values[0] as string[])
        : typeof values[0] === "string"
          ? [values[0]]
          : [];
      locks.push(...list);
      return [{ locked: list.length }];
    }
    if (
      /SELECT\s+ip_hash,\s*tokens,\s*updated_at\s+FROM\s+mcp_public_rate/i.test(
        sql,
      )
    ) {
      const keys = Array.isArray(values[0]) ? (values[0] as string[]) : [];
      const rows: { ip_hash: string; tokens: number; updated_at: Date }[] = [];
      for (const k of keys) {
        const found = buckets.get(k.trim());
        if (found) {
          rows.push({
            ip_hash: found.ipHash.padEnd(64, " "),
            tokens: found.tokens,
            updated_at: found.updatedAt,
          });
        }
      }
      return rows;
    }
    return [];
  };
  const runExecuteRaw = async (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const sql = query.join("?");
    statements.push({ sql, values });
    if (/DELETE\s+FROM\s+mcp_public_rate/i.test(sql)) {
      const cutoff =
        values[0] instanceof Date ? values[0] : new Date(String(values[0]));
      let count = 0;
      for (const [key, row] of buckets) {
        if (row.updatedAt < cutoff) {
          buckets.delete(key);
          count++;
        }
      }
      return count;
    }
    if (/INSERT\s+INTO\s+mcp_public_rate/i.test(sql)) {
      const keys = (values[0] as string[]) ?? [];
      const tokens = (values[1] as number[]) ?? [];
      const times = (values[2] as Date[]) ?? [];
      for (let i = 0; i < keys.length; i++) {
        const ipHash = keys[i].trim();
        const t = times[i];
        const updatedAt = t instanceof Date ? t : new Date(String(t));
        buckets.set(ipHash, {
          ipHash,
          tokens: Number(tokens[i]),
          updatedAt,
        });
      }
      return keys.length;
    }
    return 0;
  };
  const tx = {
    $queryRaw: vi.fn(runQueryRaw),
    $executeRaw: vi.fn(runExecuteRaw),
  };
  const $transaction = vi.fn(
    async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => fn(tx),
  );
  const db: McpRateDb & {
    buckets: Map<string, Bucket>;
    locks: string[];
    queries: string[];
    statements: { sql: string; values: unknown[] }[];
    tx: typeof tx;
    $transaction: typeof $transaction;
  } = {
    buckets,
    locks,
    queries,
    statements,
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
  MCP_PUBLIC_COLD_DB_TIMEOUT_MS,
  MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
  MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
  MCP_PUBLIC_DB_TIMEOUT_MS,
  MCP_PUBLIC_FALLBACK_LIMIT,
  MCP_PUBLIC_GLOBAL_BURST,
  MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
  MCP_PUBLIC_IP_BURST,
  MCP_PUBLIC_IP_HOURLY_LIMIT,
  MCP_PUBLIC_MAX_TOOL_BUCKETS,
  MCP_PUBLIC_SESSION_BURST,
  MCP_PUBLIC_SESSION_HOURLY_LIMIT,
  MCP_PUBLIC_TOOL_BURST,
  MCP_PUBLIC_TOOL_HOURLY_LIMIT,
  MCP_PUBLIC_TX_MAX_WAIT_MS,
  MCP_PUBLIC_TX_TIMEOUT_MS,
  buildMcpPublicBuckets,
  checkMcpPublicLimit,
  extractMcpToolNames,
  isMcpRateDbWarm,
  maybeWarmMcpRateDb,
  mcpIpHash,
  mcpPublicScopeLimits,
  resetMcpPublicRateState,
  shouldAutoWarmMcpRateDb,
  warmMcpRateDb,
  type McpRateDb,
} from "@/lib/mcpPublicLimit";

const now = new Date("2026-11-01T00:00:00.000Z");

beforeEach(() => {
  sharedDb.buckets.clear();
  sharedDb.locks.length = 0;
  sharedDb.queries.length = 0;
  sharedDb.statements.length = 0;
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

    db.tx.$executeRaw.mockClear();

    // Second call is denied by tool bucket; IP and global must remain at 9
    const second = await checkMcpPublicLimit(headers, now, callBody, db);
    expect(second.denied?.status).toBe(429);
    expect(await second.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "tool",
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
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

  it("emits RateLimit-Policy: fallback and structured WARNING log without secrets when DB is unavailable", async () => {
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
    expect(gate.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(gate.headers.get("RateLimit-Limit")).toBe("60");
    expect(gate.headers.get("RateLimit-Remaining")).toBe("59");
    expect(gate.headers.get("RateLimit-Reset")).toBe("1");
    expect(gate.headers.get("Cache-Control")).toBe("no-store");
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(JSON.parse(logged)).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable: P2021",
      reason: "P2021",
    });
    expect(logged).not.toContain("super-secret-password");
    expect(logged).not.toContain("postgres://");

    // Also test timeout fallback
    warn.mockClear();
    vi.useFakeTimers();
    db.$transaction.mockImplementationOnce(() => new Promise(() => {}));
    const pending = checkMcpPublicLimit(
      new Headers({ "x-real-ip": "198.51.100.89" }),
      now,
      undefined,
      db,
    );
    await vi.advanceTimersByTimeAsync(MCP_PUBLIC_DB_TIMEOUT_MS);
    const timeoutGate = await pending;
    expect(timeoutGate.denied).toBeNull();
    expect(timeoutGate.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(timeoutGate.headers.get("RateLimit-Limit")).toBe("60");
    expect(timeoutGate.headers.get("RateLimit-Remaining")).toBe("59");
    expect(timeoutGate.headers.get("RateLimit-Reset")).toBe("1");
    expect(timeoutGate.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable: timeout",
      reason: "timeout",
    });
  });

  it("never selects pg_advisory_xact_lock as a bare void column in $queryRaw", async () => {
    const db = createMemoryRateDb();
    const gate = await checkMcpPublicLimit(
      new Headers({
        "x-real-ip": "198.51.100.42",
        "mcp-session-id": "void-lock-regression",
      }),
      now,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_honmei_star" },
      },
      db,
    );
    expect(gate.denied).toBeNull();
    expect(db.queries.length).toBeGreaterThan(0);
    const lockSql = db.queries[0];
    expect(lockSql).toContain("AS locked");
    expect(lockSql).toContain("pg_advisory_xact_lock");
    expect(lockSql).toContain("unnest(");
    for (const sql of db.queries) {
      expect(sql).not.toMatch(/^\s*SELECT\s+pg_advisory_xact_lock\s*\(/i);
    }
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

  it("uses the cold transaction and outer timeouts on the first cold call and the short warm budgets once warmed", async () => {
    resetMcpPublicRateState();
    expect(isMcpRateDbWarm()).toBe(false);
    const db = createMemoryRateDb();
    const headers = new Headers({ "x-real-ip": "198.51.100.120" });

    // 1st call: cold path uses long maxWait (2500) and timeout (3000)
    const first = await checkMcpPublicLimit(headers, now, undefined, db);
    expect(first.denied).toBeNull();
    expect(isMcpRateDbWarm()).toBe(true);
    expect(db.$transaction).toHaveBeenNthCalledWith(1, expect.any(Function), {
      maxWait: MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });

    // 2nd call: warm path uses short maxWait (800) and timeout (2000)
    const second = await checkMcpPublicLimit(headers, now, undefined, db);
    expect(second.denied).toBeNull();
    expect(db.$transaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      maxWait: MCP_PUBLIC_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });

    // Even if warmMcpRateDb (SELECT 1) succeeds first, cold flag stays false until the 1st tx commits
    resetMcpPublicRateState();
    const db2 = {
      ...createMemoryRateDb(),
      $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    };
    expect(await warmMcpRateDb(db2)).toBe(true);
    expect(isMcpRateDbWarm()).toBe(false);
    await checkMcpPublicLimit(headers, now, undefined, db2);
    expect(isMcpRateDbWarm()).toBe(true);
    expect(db2.$transaction).toHaveBeenNthCalledWith(1, expect.any(Function), {
      maxWait: MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });
    await checkMcpPublicLimit(headers, now, undefined, db2);
    expect(db2.$transaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      maxWait: MCP_PUBLIC_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });

    // Cold outer race timeout is 3500ms while warm outer race timeout is 2200ms
    resetMcpPublicRateState();
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hangingDb = createMemoryRateDb();
    hangingDb.$transaction.mockImplementationOnce(() => new Promise(() => {}));
    let coldResolved = false;
    const coldPending = checkMcpPublicLimit(
      headers,
      now,
      undefined,
      hangingDb,
    ).then((res) => {
      coldResolved = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(MCP_PUBLIC_DB_TIMEOUT_MS);
    expect(coldResolved).toBe(false);
    await vi.advanceTimersByTimeAsync(
      MCP_PUBLIC_COLD_DB_TIMEOUT_MS - MCP_PUBLIC_DB_TIMEOUT_MS,
    );
    const coldResult = await coldPending;
    expect(coldResolved).toBe(true);
    expect(coldResult.headers.get("RateLimit-Policy")).toBe("fallback");
    warn.mockRestore();
  });

  it("runs SELECT 1 once in warmMcpRateDb, memoizes success, and retries after sanitized failure", async () => {
    resetMcpPublicRateState();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sqlCalls: string[] = [];
    const rawQuery = vi
      .fn<
        (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
      >()
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            "connect ECONNREFUSED postgres://user:secret-pw@db.example:5432/app",
          ),
          { code: "P1001" },
        ),
      )
      .mockImplementation(async (query: TemplateStringsArray) => {
        sqlCalls.push(query.join("?"));
        return [{ ok: 1 }];
      });
    const db: McpRateDb = {
      ...createMemoryRateDb(),
      $queryRaw: rawQuery,
    };

    // First attempt fails, swallows error, logs sanitized reason code
    const firstAttempt = await warmMcpRateDb(db);
    expect(firstAttempt).toBe(false);
    expect(isMcpRateDbWarm()).toBe(false);
    expect(rawQuery).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(JSON.parse(logged)).toEqual({
      severity: "WARNING",
      message: "[mcp] rate limit unavailable: P1001",
      reason: "P1001",
    });
    expect(logged).not.toContain("secret-pw");

    // Second attempt retries and succeeds (SELECT 1 alone does not flip warm flag)
    const p1 = warmMcpRateDb(db);
    const p2 = warmMcpRateDb(db);
    expect(p1).toBe(p2);
    expect(await p1).toBe(true);
    expect(isMcpRateDbWarm()).toBe(false);
    expect(rawQuery).toHaveBeenCalledTimes(2);
    expect(sqlCalls[0]).toContain("SELECT 1");

    // Subsequent call reuses memoized promise without querying again
    expect(await warmMcpRateDb(db)).toBe(true);
    expect(rawQuery).toHaveBeenCalledTimes(2);
  });

  it("enforces the 60/min per-IP fallback token bucket when the DB throws, denying the 61st request while allowing another IP", async () => {
    resetMcpPublicRateState();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createMemoryRateDb();
    db.$transaction.mockRejectedValue(
      Object.assign(new Error("Transaction start timeout"), { code: "P2028" }),
    );

    const ipA = new Headers({ "x-real-ip": "198.51.100.201" });
    const ipB = new Headers({ "x-real-ip": "198.51.100.202" });

    for (let i = 0; i < MCP_PUBLIC_FALLBACK_LIMIT; i++) {
      const gate = await checkMcpPublicLimit(ipA, now, undefined, db);
      expect(gate.denied).toBeNull();
      expect(gate.headers.get("RateLimit-Policy")).toBe("fallback");
      expect(gate.headers.get("RateLimit-Limit")).toBe("60");
      expect(gate.headers.get("RateLimit-Remaining")).toBe(
        String(MCP_PUBLIC_FALLBACK_LIMIT - 1 - i),
      );
      expect(Number(gate.headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
      expect(gate.headers.get("Cache-Control")).toBe("no-store");
    }

    // 61st request from the same IP within a minute is denied with 429 and scope: fallback
    const deniedGate = await checkMcpPublicLimit(ipA, now, undefined, db);
    expect(deniedGate.denied?.status).toBe(429);
    expect(deniedGate.denied?.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(deniedGate.denied?.headers.get("RateLimit-Limit")).toBe("60");
    expect(deniedGate.denied?.headers.get("RateLimit-Remaining")).toBe("0");
    expect(deniedGate.denied?.headers.get("Retry-After")).toBe("1");
    expect(deniedGate.denied?.headers.get("Cache-Control")).toBe("no-store");
    expect(await deniedGate.denied?.json()).toEqual({
      error: "Too many requests",
      scope: "fallback",
    });

    // Another IP still passes
    const otherGate = await checkMcpPublicLimit(ipB, now, undefined, db);
    expect(otherGate.denied).toBeNull();
    expect(otherGate.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(otherGate.headers.get("RateLimit-Limit")).toBe("60");
    expect(otherGate.headers.get("RateLimit-Remaining")).toBe("59");
  });

  it("does not start warm-up under NODE_ENV=test or phase-production-build", async () => {
    resetMcpPublicRateState();
    const db = {
      ...createMemoryRateDb(),
      $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    };

    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "test",
        NEXT_RUNTIME: "nodejs",
      }),
    ).toBe(false);
    expect(
      maybeWarmMcpRateDb(
        {
          NODE_ENV: "test",
          NEXT_RUNTIME: "nodejs",
        },
        db,
      ),
    ).toBeNull();

    expect(
      shouldAutoWarmMcpRateDb({
        NODE_ENV: "production",
        NEXT_RUNTIME: "nodejs",
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBe(false);
    expect(
      maybeWarmMcpRateDb(
        {
          NODE_ENV: "production",
          NEXT_RUNTIME: "nodejs",
          NEXT_PHASE: "phase-production-build",
        },
        db,
      ),
    ).toBeNull();

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
      const { register: registerInstrumentation } =
        await import("@/instrumentation");

      delete process.env.NEXT_RUNTIME;
      await registerInstrumentation();
      await Promise.resolve();
      expect(imported).not.toHaveBeenCalled();

      vi.stubEnv("NEXT_RUNTIME", "edge");
      await registerInstrumentation();
      await Promise.resolve();
      expect(imported).not.toHaveBeenCalled();

      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      shouldAutoWarmMock.mockReturnValueOnce(false);
      await registerInstrumentation();
      await vi.waitFor(() => {
        expect(shouldAutoWarmMock).toHaveBeenCalledTimes(1);
      });
      expect(imported).toHaveBeenCalledTimes(1);
      expect(warmMock).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/lib/mcpPublicLimit");
      vi.resetModules();
    }

    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(isMcpRateDbWarm()).toBe(false);
  });

  it("issues at most 4 parameterized ANY/unnest statements for ip+global+session+3 tools without interpolating keys", async () => {
    const db = createMemoryRateDb();
    const staleKey = "a".repeat(64);
    const freshKey = "b".repeat(64);
    db.buckets.set(staleKey, {
      ipHash: staleKey,
      tokens: 10,
      updatedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
    });
    db.buckets.set(freshKey, {
      ipHash: freshKey,
      tokens: 10,
      updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    });

    const headers = new Headers({
      "x-real-ip": "198.51.100.150",
      "mcp-session-id": "sess-multi-3-tools",
    });
    const batch3Tools = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_honmei_star" },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_kanshi" },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "judge_directions" },
      },
    ];

    const expectedBuckets = buildMcpPublicBuckets(headers, batch3Tools);
    expect(expectedBuckets).toHaveLength(6); // ip + global + session + 3 tools
    const allBucketKeys = expectedBuckets.map((b) => b.key);

    const first = await checkMcpPublicLimit(headers, now, batch3Tools, db);
    expect(first.denied).toBeNull();

    // At most 4 statements inside the transaction (lock, select, stale delete, multi-row upsert)
    expect(db.statements.length).toBeLessThanOrEqual(4);
    expect(db.statements).toHaveLength(4);
    expect(db.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.tx.$executeRaw).toHaveBeenCalledTimes(2);

    // No bucket key hash is interpolated into any SQL text
    for (const stmt of db.statements) {
      for (const key of allBucketKeys) {
        expect(stmt.sql).not.toContain(key);
      }
    }

    // 1. Advisory lock uses unnest with sorted prefixed keys array
    expect(db.statements[0].sql).toContain("pg_advisory_xact_lock");
    expect(db.statements[0].sql).toContain("unnest(");
    expect(db.statements[0].values[0]).toEqual(
      [...allBucketKeys].sort().map((k) => `mcp-public:${k}`),
    );

    // 2. SELECT uses ANY with bound array of keys
    expect(db.statements[1].sql).toContain("FROM mcp_public_rate");
    expect(db.statements[1].sql).toContain("ANY(");
    expect(Array.isArray(db.statements[1].values[0])).toBe(true);
    expect(db.statements[1].values[0]).toHaveLength(6);

    // 3. Stale DELETE removed the 7h-old row and kept the 1h-old row
    expect(db.statements[2].sql).toMatch(/DELETE\s+FROM\s+mcp_public_rate/i);
    expect(db.buckets.has(staleKey)).toBe(false);
    expect(db.buckets.has(freshKey)).toBe(true);

    // 4. Upsert uses unnest with bound arrays for keys, tokens, and timestamps
    expect(db.statements[3].sql).toContain("INSERT INTO mcp_public_rate");
    expect(db.statements[3].sql).toContain("unnest(");
    expect(db.statements[3].sql).toContain("ON CONFLICT (ip_hash) DO UPDATE");
    expect(db.statements[3].values[0]).toEqual(allBucketKeys);
    expect(db.statements[3].values[1]).toHaveLength(6);
    expect(db.statements[3].values[2]).toHaveLength(6);

    // Second request for the same IP skips stale DELETE -> 3 statements total
    db.statements.length = 0;
    const second = await checkMcpPublicLimit(headers, now, batch3Tools, db);
    expect(second.denied).toBeNull();
    expect(db.statements).toHaveLength(3);
    expect(db.buckets.get(mcpIpHash("198.51.100.150"))?.tokens).toBe(
      MCP_PUBLIC_IP_BURST - 2,
    );
  });

  it("flips the cold flag only after a rate-limit transaction has actually committed", async () => {
    resetMcpPublicRateState();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseDb = createMemoryRateDb();
    const db = {
      ...baseDb,
      $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    };
    const headers = new Headers({ "x-real-ip": "198.51.100.160" });

    // Warm-up SELECT 1 succeeds, but cold flag must remain false
    expect(await warmMcpRateDb(db)).toBe(true);
    expect(isMcpRateDbWarm()).toBe(false);

    // A failing transaction must NOT flip the cold flag
    db.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("Interactive transaction expired"), {
        code: "P2028",
      }),
    );
    const failedGate = await checkMcpPublicLimit(headers, now, undefined, db);
    expect(failedGate.headers.get("RateLimit-Policy")).toBe("fallback");
    expect(isMcpRateDbWarm()).toBe(false);
    expect(db.$transaction).toHaveBeenNthCalledWith(1, expect.any(Function), {
      maxWait: MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });

    // Next call still runs with cold budget; warm flag only flips after commit
    let warmDuringTx = true;
    db.$transaction.mockImplementationOnce(async (fn) => {
      warmDuringTx = isMcpRateDbWarm();
      return fn(db.tx);
    });
    const committedGate = await checkMcpPublicLimit(
      headers,
      now,
      undefined,
      db,
    );
    expect(committedGate.denied).toBeNull();
    expect(warmDuringTx).toBe(false);
    expect(isMcpRateDbWarm()).toBe(true);
    expect(db.$transaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      maxWait: MCP_PUBLIC_COLD_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_COLD_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });

    // Subsequent call after commit uses warm budget (800 / 2000)
    await checkMcpPublicLimit(headers, now, undefined, db);
    expect(db.$transaction).toHaveBeenNthCalledWith(3, expect.any(Function), {
      maxWait: MCP_PUBLIC_TX_MAX_WAIT_MS,
      timeout: MCP_PUBLIC_TX_TIMEOUT_MS,
      isolationLevel: "ReadCommitted",
    });
    warn.mockRestore();
  });
});
