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
import { createMcpProfileStore } from "@/lib/mcpProfileStore";
import { listMcpProfiles } from "@/lib/mcpProfiles";
const userId = "11111111-1111-4111-8111-111111111111";
const connection = "postgresql://test:test@127.0.0.1:1/test";
beforeEach(() => {
  vi.resetAllMocks();
  pool.connect.mockResolvedValue(client);
  pool.end.mockResolvedValue(undefined);
  client.query.mockResolvedValue({ rows: [] });
});
describe("dormant bounded MCP profile pool", () => {
  it.each([
    "private invalid URL",
    "https://example.com",
    connection + "?statement_timeout=0",
  ])("rejects configuration without leaking it: %s", (value) => {
    expect(() => createMcpProfileStore(value)).toThrow(
      "MCP_DATABASE_CONFIGURATION_INVALID",
    );
    expect(construct).not.toHaveBeenCalled();
  });
  it("does not connect at construction; bounds connection/SQL and uses an owner parameter and minimum columns", async () => {
    const store = createMcpProfileStore(connection);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: connection,
        statement_timeout: 4000,
        query_timeout: 4500,
        connectionTimeoutMillis: 1000,
        max: 2,
      }),
    );
    const read = store.profileReader(new AbortController().signal, () => 750);
    expect(
      await listMcpProfiles({ userId, allowedProfileIds: [] }, {}, read),
    ).toMatchObject({ profiles: [] });
    expect(client.query).toHaveBeenCalledExactlyOnceWith({
      text: "SELECT presets, metaphysical_config, updated_at FROM user_configs WHERE user_id = $1::uuid LIMIT 1",
      values: [userId],
      query_timeout: 750,
    });
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
    await store.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });
  it.each([0, -1, NaN, Infinity])(
    "refuses an invalid budget %s without acquiring a connection",
    async (remaining) => {
      const store = createMcpProfileStore(connection);
      await expect(
        store.profileReader(
          new AbortController().signal,
          () => remaining,
        )(userId),
      ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );
  it("refuses invalid owners and already aborted requests before acquiring", async () => {
    const store = createMcpProfileStore(connection);
    const controller = new AbortController();
    const read = store.profileReader(controller.signal, () => 5000);
    await expect(read("invalid")).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    controller.abort();
    await expect(read(userId)).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("destroys a connection acquired after cancellation without issuing SQL", async () => {
    const store = createMcpProfileStore(connection);
    const controller = new AbortController();
    pool.connect.mockImplementation(async () => {
      controller.abort();
      return client;
    });
    await expect(
      store.profileReader(controller.signal, () => 5000)(userId),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("destroys an active connection on abort and refuses a late row without double release", async () => {
    const store = createMcpProfileStore(connection);
    const controller = new AbortController();
    let resolve!: (value: { rows: unknown[] }) => void;
    client.query.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = store.profileReader(controller.signal, () => 5000)(userId);
    await vi.waitFor(() => expect(client.query).toHaveBeenCalledOnce());
    controller.abort();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    resolve({ rows: [{ presets: [{ name: "private" }] }] });
    await expect(pending).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
  it("refuses exhausted budget after SQL and discards the connection on driver failure", async () => {
    const store = createMcpProfileStore(connection);
    let remaining = 400;
    client.query.mockImplementation(async () => {
      remaining = 0;
      return { rows: [] };
    });
    await expect(
      store.profileReader(
        new AbortController().signal,
        () => remaining,
      )(userId),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.release).toHaveBeenCalledWith(true);
    client.query.mockRejectedValue(new Error("private SQL/token"));
    const error = await store
      .profileReader(
        new AbortController().signal,
        () => 5000,
      )(userId)
      .catch((e) => e);
    expect(error.message).toBe("TEMPORARILY_UNAVAILABLE");
    expect(error.cause).toBeUndefined();
  });
});
