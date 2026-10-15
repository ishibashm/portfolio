// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { pool, client, construct } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(), end: vi.fn(), on: vi.fn() };
  return { pool, client, construct: vi.fn() };
});
vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      construct(config);
      return pool;
    }
  },
}));
vi.mock("@/lib/prisma", () => {
  throw new Error("site DB forbidden");
});
import { createMcpDatabase } from "@/lib/mcpDatabase";
const connection = "postgresql://test:test@127.0.0.1:1/test";
function setup() {
  const db = createMcpDatabase(connection);
  const controller = new AbortController();
  const remainingMs = vi.fn(() => 900);
  const run = () =>
    db.query("SELECT $1::text", ["private-value"], {
      signal: controller.signal,
      remainingMs,
    });
  return { db, controller, remainingMs, run };
}
beforeEach(() => {
  vi.resetAllMocks();
  pool.connect.mockResolvedValue(client);
  pool.end.mockResolvedValue(undefined);
  client.query.mockResolvedValue({ rows: [{ ok: true }], rowCount: 1 });
});
describe("dedicated MCP single-statement executor", () => {
  it.each([
    "invalid private URL",
    "https://example.com",
    connection + "?statement_timeout=0",
    connection + "#fragment",
  ])("rejects unsafe configuration %s", (url) => {
    expect(() => createMcpDatabase(url)).toThrow(
      "MCP_DATABASE_CONFIGURATION_INVALID",
    );
    expect(construct).not.toHaveBeenCalled();
  });
  it("is lazy and binds parameters with a bounded driver timeout", async () => {
    const s = setup();
    expect(pool.connect).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 2,
        connectionTimeoutMillis: 1000,
        statement_timeout: 4000,
        query_timeout: 4500,
      }),
    );
    expect(await s.run()).toEqual({ rows: [{ ok: true }], rowCount: 1 });
    expect(client.query).toHaveBeenCalledExactlyOnceWith({
      text: "SELECT $1::text",
      values: ["private-value"],
      query_timeout: 900,
    });
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
    await s.db.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });
  it.each([0, -1, NaN, Infinity, 5001])(
    "rejects invalid budget %s before connection",
    async (ms) => {
      const s = setup();
      s.remainingMs.mockReturnValue(ms);
      await expect(s.run()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );
  it("does not query a connection delivered after cancellation", async () => {
    const s = setup();
    pool.connect.mockImplementation(async () => {
      s.controller.abort();
      return client;
    });
    await expect(s.run()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("destroys active sockets once and rejects late completion", async () => {
    const s = setup();
    let finish!: (value: unknown) => void;
    client.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = s.run();
    await vi.waitFor(() => expect(client.query).toHaveBeenCalledOnce());
    s.controller.abort();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    finish({ rows: [], rowCount: 1 });
    await expect(pending).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
  it("rejects late completion without an abort event", async () => {
    const s = setup();
    client.query.mockImplementation(async () => {
      s.remainingMs.mockReturnValue(0);
      return { rows: [] };
    });
    await expect(s.run()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("redacts connection, query and shutdown failures without logging", async () => {
    const s = setup();
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    try {
      pool.connect.mockRejectedValueOnce(new Error("private-credentials"));
      client.query.mockRejectedValue(new Error("private-SQL"));
      pool.end.mockRejectedValue(new Error("private-host"));
      for (const run of [s.run, s.run, s.db.close]) {
        const error = await run().catch((e: Error) => e);
        expect(error).toMatchObject({ message: "TEMPORARILY_UNAVAILABLE" });
        expect(error).not.toHaveProperty("cause");
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
