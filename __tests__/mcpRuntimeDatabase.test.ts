// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createMcpDatabaseScope,
  createMcpRuntimeDatabase,
} from "@/lib/mcpRuntimeDatabase";

const budget = () => ({
  signal: new AbortController().signal,
  remainingMs: () => 5000,
});
describe("request-local MCP database boundary", () => {
  it("rejects unscoped calls before starting I/O", async () => {
    const scope = createMcpDatabaseScope();
    const query = vi.fn();
    await expect(scope.query(query)).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(query).not.toHaveBeenCalled();
  });
  it("isolates concurrent requests and stops the expired chain", async () => {
    const scope = createMcpDatabaseScope();
    const controller = new AbortController();
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const next = vi.fn();
    const slow = scope.run(
      { ...budget(), signal: controller.signal },
      async () => {
        await scope.query(() => pending);
        await scope.query(next);
      },
    );
    const failed = expect(slow).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    controller.abort();
    const fast = await scope.run(budget(), () =>
      scope.query(async () => "other user"),
    );
    expect(fast).toBe("other user");
    complete();
    await failed;
    expect(next).not.toHaveBeenCalled();
  });
  it.each([0, -1, 5001, Infinity, NaN])(
    "refuses invalid remaining budget %s",
    async (ms) => {
      const scope = createMcpDatabaseScope();
      const query = vi.fn();
      await expect(
        scope.run({ ...budget(), remainingMs: () => ms }, query),
      ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
      expect(query).not.toHaveBeenCalled();
    },
  );
  it("checks deadlines again after I/O and strips raw errors", async () => {
    const scope = createMcpDatabaseScope();
    let remaining = 10;
    await expect(
      scope.run({ ...budget(), remainingMs: () => remaining }, () =>
        scope.query(async () => {
          remaining = 0;
          return "private";
        }),
      ),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    await expect(
      scope.run(budget(), () =>
        scope.query(async () => {
          throw new Error("private SQL credential");
        }),
      ),
    ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
  });
  it.each([
    "https://db.invalid",
    "postgresql://test:test@127.0.0.1/db?statement_timeout=0",
    "postgresql://test:test@127.0.0.1/db#private",
  ])("rejects overriding pool configuration", (url) => {
    expect(() => createMcpRuntimeDatabase(url)).toThrow(
      "MCP_DATABASE_CONFIGURATION_INVALID",
    );
  });
  it("real Prisma extension blocks model and raw queries without connecting", async () => {
    const runtime = createMcpRuntimeDatabase(
      "postgresql://test:test@127.0.0.1:1/test",
    );
    try {
      await expect(runtime.db.mcpGrant.findMany()).rejects.toThrow(
        "TEMPORARILY_UNAVAILABLE",
      );
      await expect(runtime.db.$queryRaw`SELECT 1`).rejects.toThrow(
        "TEMPORARILY_UNAVAILABLE",
      );
    } finally {
      await runtime.close();
    }
  });
});
