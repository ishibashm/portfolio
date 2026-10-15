// @vitest-environment node
import type { PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { createMcpUsageStore } from "@/lib/mcpUsageStore";

const userId = "11111111-1111-4111-8111-111111111111";
const grantId = "22222222-2222-4222-8222-222222222222";
function setup() {
  const execute = vi.fn().mockResolvedValue(1);
  const controller = new AbortController();
  const remainingMs = vi.fn(() => 1000);
  const store = createMcpUsageStore({
    db: { $executeRaw: execute } as unknown as PrismaClient,
  });
  const mark = (user = userId, grant = grantId) =>
    store.markUsed(user, grant, { signal: controller.signal, remainingMs });
  return { execute, controller, remainingMs, mark };
}

it("updates only an active owned grant, using DB time monotonically (SQL contract, no DB)", async () => {
  const s = setup();
  await s.mark();
  expect(s.execute).toHaveBeenCalledTimes(1);
  const [sql, ...values] = s.execute.mock.calls[0];
  const text = sql.join("?");
  expect(values).toEqual([grantId, userId]);
  expect(text).toContain('"id" = ?::uuid AND "userId" = ?::uuid');
  expect(text).toContain('"revokedAt" IS NULL');
  expect(text).toContain('"createdAt" <= statement_timestamp()');
  expect(text).toContain('"expiresAt" > statement_timestamp()');
  expect(text).toContain(
    'GREATEST(COALESCE("lastUsedAt", statement_timestamp()), statement_timestamp())',
  );
  expect(text.match(/SET[\s\S]*?WHERE/)?.[0]).not.toMatch(
    /revokedAt|expiresAt|allowedProfileIds/,
  );
  expect(s.remainingMs).toHaveBeenCalledTimes(2);
});

it.each([0, 2])(
  "refuses publication when the conditional update affects %s grants",
  async (count) => {
    const s = setup();
    s.execute.mockResolvedValue(count);
    await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
  },
);

it.each([0, -1, NaN, Infinity, 5001])(
  "does not write with invalid remaining budget %s",
  async (remaining) => {
    const s = setup();
    s.remainingMs.mockReturnValue(remaining);
    await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(s.execute).not.toHaveBeenCalled();
  },
);

it("refuses invalid identifiers and already cancelled requests before DB access", async () => {
  const s = setup();
  await expect(s.mark("private-token")).rejects.toThrow(
    "TEMPORARILY_UNAVAILABLE",
  );
  await expect(s.mark(userId, "private-profile")).rejects.toThrow(
    "TEMPORARILY_UNAVAILABLE",
  );
  s.controller.abort();
  await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
  expect(s.execute).not.toHaveBeenCalled();
});

it.each(["abort", "expiry"])(
  "refuses late completion after %s without another write",
  async (mode) => {
    const s = setup();
    s.execute.mockImplementation(async () => {
      if (mode === "abort") s.controller.abort();
      else s.remainingMs.mockReturnValue(0);
      return 1;
    });
    await expect(s.mark()).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(s.execute).toHaveBeenCalledTimes(1);
  },
);

it("does not log or retain raw storage errors", async () => {
  const s = setup();
  s.execute.mockRejectedValue(new Error("private-token private-birth"));
  const spies = [
    vi.spyOn(console, "log"),
    vi.spyOn(console, "warn"),
    vi.spyOn(console, "error"),
  ];
  try {
    const error = await s.mark().catch((e: Error) => e);
    expect(error).toMatchObject({ message: "TEMPORARILY_UNAVAILABLE" });
    expect(error).not.toHaveProperty("cause");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
