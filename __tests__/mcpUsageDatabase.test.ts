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
import { createMcpUsageStore } from "@/lib/mcpUsageStore";
const userId = "11111111-1111-4111-8111-111111111111";
const grantId = "22222222-2222-4222-8222-222222222222";
function setup() {
  const database = createMcpDatabase("postgresql://test:test@127.0.0.1:1/test");
  const store = createMcpUsageStore({ database });
  const controller = new AbortController();
  const budget = { signal: controller.signal, remainingMs: vi.fn(() => 600) };
  return {
    controller,
    budget,
    mark: () => store.markUsed(userId, grantId, budget),
    store,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  pool.connect.mockResolvedValue(client);
  client.query.mockResolvedValue({ rows: [], rowCount: 1 });
});
describe("usage writer with dedicated bounded database", () => {
  it("binds identifiers and propagates the original deadline to pg", async () => {
    const s = setup();
    await s.mark();
    expect(client.query).toHaveBeenCalledExactlyOnceWith({
      text: expect.stringContaining('"id" = $1::uuid AND "userId" = $2::uuid'),
      values: [grantId, userId],
      query_timeout: 600,
    });
    const text = client.query.mock.calls[0][0].text;
    expect(text).toContain('"revokedAt" IS NULL');
    expect(text).toContain('"expiresAt" > statement_timestamp()');
    expect(text).toContain('"createdAt" <= statement_timestamp()');
    expect(text).toContain(
      'GREATEST(COALESCE("lastUsedAt", statement_timestamp()), statement_timestamp())',
    );
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it.each([0, 2, null])(
    "refuses unexpected affected row count %s",
    async (rowCount) => {
      const s = setup();
      client.query.mockResolvedValue({ rows: [], rowCount });
      await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    },
  );
  it("refuses invalid identities or expired budgets without connecting", async () => {
    const s = setup();
    await expect(
      s.store.markUsed("private", grantId, s.budget),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    s.budget.remainingMs.mockReturnValue(0);
    await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("does not issue an update if connection acquisition finishes after abort", async () => {
    const s = setup();
    pool.connect.mockImplementation(async () => {
      s.controller.abort();
      return client;
    });
    await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("destroys an active update connection and never accepts late success", async () => {
    const s = setup();
    let finish!: (value: unknown) => void;
    client.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = s.mark();
    await vi.waitFor(() => expect(client.query).toHaveBeenCalledOnce());
    s.controller.abort();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    finish({ rows: [], rowCount: 1 });
    await expect(pending).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
