import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createMcpAuditStore, type McpAuditInput } from "@/lib/mcpAuditStore";

const at = new Date("2026-10-12T00:00:00Z");
const input: McpAuditInput = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "22222222-2222-4222-8222-222222222222",
  event: "get_profile",
  result: "success",
  durationMs: 12,
};
function setup(now = () => at) {
  const db = {
    mcpAccessAudit: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(3),
  };
  return {
    db,
    store: createMcpAuditStore({ db: db as unknown as PrismaClient, now }),
  };
}

describe("dormant MCP minimal audit (query contract; no DB)", () => {
  it("projects only approved fields and generates fresh IDs with exactly 30 days retention", async () => {
    const { db, store } = setup();
    const extra = {
      ...input,
      requestId: input.userId,
      birthDate: "private-birth",
      profileId: "private-profile",
      profileName: "private-name\nforged-log",
      lat: 35,
      token: "private-token",
      body: { anything: "private-body" },
      expiresAt: new Date("2099-01-01"),
    };
    await store.record(extra);
    await store.record(input);
    const data = db.mcpAccessAudit.create.mock.calls[0][0].data;
    expect(data).toEqual({
      ...input,
      requestId: expect.any(String),
      occurredAt: at,
      expiresAt: new Date("2026-11-11T00:00:00Z"),
    });
    expect(data.requestId).not.toBe(input.userId);
    expect(data.requestId).not.toBe(
      db.mcpAccessAudit.create.mock.calls[1][0].data.requestId,
    );
    expect(JSON.stringify(db.mcpAccessAudit.create.mock.calls)).not.toContain(
      "private-",
    );
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    { event: "get_profile\nforged" },
    { result: "private-error" },
    { userId: "private-token" },
    { userId: null },
    { durationMs: -1 },
    { durationMs: Infinity },
    { durationMs: 0.1 },
  ])(
    "rejects invalid metadata without persisting or exposing it: %j",
    async (patch) => {
      const { db, store } = setup();
      await expect(
        store.record({ ...input, ...patch } as McpAuditInput),
      ).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
      expect(db.mcpAccessAudit.create).not.toHaveBeenCalled();
    },
  );

  it("allows anonymous denial, never logs raw DB errors and rejects invalid clocks", async () => {
    const { db, store } = setup();
    await store.record({
      ...input,
      userId: null,
      grantId: null,
      result: "denied",
    });
    const spies = [
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "log"),
    ];
    try {
      db.mcpAccessAudit.create.mockRejectedValue(
        new Error("private-token private-birth"),
      );
      const error = await store.record(input).catch((e: Error) => e);
      expect(error).toMatchObject({ message: "TEMPORARILY_UNAVAILABLE" });
      expect(error).not.toHaveProperty("cause");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    const broken = setup(() => new Date(NaN));
    await expect(broken.store.record(input)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(broken.db.mcpAccessAudit.create).not.toHaveBeenCalled();
  });

  it("purges only expired audit rows in bounded lock-skipping batches", async () => {
    const { db, store } = setup();
    expect(await store.purgeExpired(10)).toBe(3);
    const [sql, date, limit] = db.$executeRaw.mock.calls[0];
    expect(sql.join("?")).toContain('"expiresAt" <= ?');
    expect(sql.join("?")).toContain("LIMIT ? FOR UPDATE SKIP LOCKED");
    expect(date).toEqual(at);
    expect(limit).toBe(10);
    for (const invalid of [0, 1001, 0.5, NaN]) {
      await expect(store.purgeExpired(invalid)).rejects.toThrow(
        "TEMPORARILY_UNAVAILABLE",
      );
    }
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
