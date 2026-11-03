import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Bucket = { ipHash: string; tokens: number; updatedAt: Date };
const buckets = new Map<string, Bucket>();
const db = {
  $queryRaw: vi.fn(async () => []),
  mcpPublicRate: {
    findUnique: vi.fn(async ({ where }: { where: { ipHash: string } }) => {
      return buckets.get(where.ipHash) ?? null;
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
          : create;
        buckets.set(where.ipHash, row);
        return row;
      },
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
};
const prismaMock = {
  ...db,
  $transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) =>
    fn(db),
  ),
};
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { POST } from "@/app/api/mcp/route";
import {
  MCP_PUBLIC_IP_BURST,
  MCP_PUBLIC_IP_HOURLY_LIMIT,
  checkMcpPublicLimit,
  mcpIpHash,
  mcpPublicLimits,
} from "@/lib/mcpPublicLimit";

const now = new Date("2026-11-01T00:00:00.000Z");

beforeEach(() => {
  buckets.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("uses generous defaults and ignores blank or invalid env", () => {
  expect(mcpPublicLimits({})).toEqual({
    hourly: MCP_PUBLIC_IP_HOURLY_LIMIT,
    burst: MCP_PUBLIC_IP_BURST,
  });
  expect(MCP_PUBLIC_IP_HOURLY_LIMIT).toBeGreaterThanOrEqual(1000);
  expect(MCP_PUBLIC_IP_BURST).toBeGreaterThanOrEqual(100);
  for (const value of ["0", "-1", "1.5", "bad", ""]) {
    expect(mcpPublicLimits({ MCP_PUBLIC_IP_HOURLY_LIMIT: value }).hourly).toBe(
      MCP_PUBLIC_IP_HOURLY_LIMIT,
    );
  }
  expect(
    mcpPublicLimits({
      MCP_PUBLIC_IP_HOURLY_LIMIT: "400",
      MCP_PUBLIC_IP_BURST: "40",
    }),
  ).toEqual({ hourly: 400, burst: 40 });
  expect(
    mcpPublicLimits({
      MCP_PUBLIC_IP_HOURLY_LIMIT: "100",
      MCP_PUBLIC_IP_BURST: "500",
    }).burst,
  ).toBe(100);
});

it("allows a burst, then asks the caller to wait", async () => {
  vi.stubEnv("MCP_PUBLIC_IP_HOURLY_LIMIT", "3600");
  vi.stubEnv("MCP_PUBLIC_IP_BURST", "2");
  const headers = new Headers({ "x-real-ip": "203.0.113.9" });
  expect((await checkMcpPublicLimit(headers, now)).denied).toBeNull();
  expect((await checkMcpPublicLimit(headers, now)).denied).toBeNull();
  const third = await checkMcpPublicLimit(headers, now);
  expect(third.denied?.status).toBe(429);
  expect(third.denied?.headers.get("Retry-After")).toBeTruthy();
  expect(db.$queryRaw).toHaveBeenCalled();
  const later = await checkMcpPublicLimit(
    headers,
    new Date(now.getTime() + 1000),
  );
  expect(later.denied).toBeNull();
});

it("keeps a separate bucket per IP hash and does not store the raw IP", async () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 192.0.2.9" });
  const gate = await checkMcpPublicLimit(headers, now);
  expect(gate.denied).toBeNull();
  expect(gate.headers.get("RateLimit-Limit")).toBe(
    String(MCP_PUBLIC_IP_HOURLY_LIMIT),
  );
  expect(gate.headers.get("RateLimit-Remaining")).toBeTruthy();
  const stored = JSON.stringify([...buckets.values()]);
  expect(stored).not.toContain("203.0.113.5");
  expect(stored).not.toContain("192.0.2.9");
  expect(stored).toContain(mcpIpHash("192.0.2.9"));
  const other = await checkMcpPublicLimit(
    new Headers({ "x-forwarded-for": "198.51.100.8" }),
    now,
  );
  expect(other.denied).toBeNull();
  expect(buckets.size).toBe(3);
});

it("returns 429 with Retry-After and RateLimit headers when the bucket is empty", async () => {
  vi.stubEnv("MCP_PUBLIC_IP_BURST", "1");
  const headers = new Headers({ "x-real-ip": "198.51.100.20" });
  expect((await checkMcpPublicLimit(headers, now)).denied).toBeNull();
  const denied = (await checkMcpPublicLimit(headers, now)).denied;
  expect(denied?.status).toBe(429);
  expect(denied?.headers.get("Retry-After")).toBeTruthy();
  expect(denied?.headers.get("RateLimit-Limit")).toBe(
    String(MCP_PUBLIC_IP_HOURLY_LIMIT),
  );
  expect(denied?.headers.get("RateLimit-Remaining")).toBe("0");
  expect(denied?.headers.get("RateLimit-Reset")).toBe(
    denied?.headers.get("Retry-After"),
  );
  expect(await denied?.json()).toEqual({
    error: "Too many requests",
    scope: "ip",
  });
});

it("fails open when the database is unavailable", async () => {
  db.$queryRaw.mockRejectedValueOnce(
    new Error("relation mcp_public_rate does not exist"),
  );
  const gate = await checkMcpPublicLimit(
    new Headers({ "x-real-ip": "198.51.100.7" }),
    now,
  );
  expect(gate.denied).toBeNull();
  expect(gate.headers.get("RateLimit-Limit")).toBeNull();
});

it("fails open when the limiter does not answer in time", async () => {
  vi.useFakeTimers();
  prismaMock.$transaction.mockImplementationOnce(() => new Promise(() => {}));
  const pending = checkMcpPublicLimit(
    new Headers({ "x-real-ip": "198.51.100.9" }),
    now,
  );
  await vi.advanceTimersByTimeAsync(1500);
  const gate = await pending;
  expect(gate.denied).toBeNull();
  vi.useRealTimers();
});

it("POST /api/mcp returns the limiter response", async () => {
  vi.stubEnv("MCP_PUBLIC_IP_BURST", "1");
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-real-ip": "198.51.100.30",
  };
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "t", version: "0" },
    },
  });
  const first = await POST(
    new Request("https://cloud-palette.com/api/mcp", {
      method: "POST",
      headers,
      body,
    }),
  );
  expect(first.status).toBe(200);
  expect(first.headers.get("RateLimit-Limit")).toBe(
    String(MCP_PUBLIC_IP_HOURLY_LIMIT),
  );
  const second = await POST(
    new Request("https://cloud-palette.com/api/mcp", {
      method: "POST",
      headers,
      body,
    }),
  );
  expect(second.status).toBe(429);
  expect(second.headers.get("Retry-After")).toBeTruthy();
});
