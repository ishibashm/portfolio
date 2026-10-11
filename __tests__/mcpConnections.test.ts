import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createMcpConnectionService } from "@/lib/mcpConnections";

const userId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const at = new Date("2026-10-11T00:00:00Z");
function setup() {
  const row = {
    id,
    clientId: "client",
    allowedProfileIds: ["one"],
    createdAt: new Date(at.getTime() - 1000),
    expiresAt: new Date(at.getTime() + 1000),
    revokedAt: null,
    lastUsedAt: null,
  };
  const db = {
    mcpGrant: {
      findMany: vi.fn().mockResolvedValue([row]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id, providerGrantId: "protocol-grant" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const store = { revokeByGrantId: vi.fn().mockResolvedValue(undefined) };
  return {
    db,
    store,
    row,
    service: createMcpConnectionService({
      db: db as unknown as PrismaClient,
      store,
      now: () => at,
    }),
  };
}
describe("dormant owner-only connection service", () => {
  it("selects only the owner's minimum management fields and marks expiry/revocation", async () => {
    const { service, db, row } = setup();
    db.mcpGrant.findMany.mockResolvedValue([
      row,
      { ...row, expiresAt: at },
      { ...row, revokedAt: at },
    ]);
    const result = await service.list(userId);
    expect(result.connections.map((r) => r.status)).toEqual([
      "active",
      "expired",
      "revoked",
    ]);
    expect(result.connections[0]).toEqual({
      ...row,
      scope: "read:profiles",
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: "active",
    });
    expect(db.mcpGrant.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { id: "asc" },
      take: 101,
      select: {
        id: true,
        clientId: true,
        allowedProfileIds: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
    expect(result.nextCursor).toBeNull();
    expect(JSON.stringify(result)).not.toContain("protocol-grant");
  });
  it("bounds pagination and keeps the owner predicate even for another owner's cursor", async () => {
    const { service, db, row } = setup();
    db.mcpGrant.findMany.mockResolvedValue(
      Array.from({ length: 101 }, () => row),
    );
    const result = await service.list(userId, id);
    expect(result.connections).toHaveLength(100);
    expect(result.nextCursor).toBe(id);
    expect(db.mcpGrant.findMany.mock.calls[0][0].where).toEqual({
      userId,
      id: { gt: id },
    });
  });
  it.each([undefined, "dev-bypass-id", "email@example.invalid"])(
    "rejects unverified/invalid identity %s before IO",
    async (user) => {
      const { service, db, store } = setup();
      await expect(service.list(user)).rejects.toThrow("LOGIN_REQUIRED");
      await expect(service.revoke(user, id)).rejects.toThrow("LOGIN_REQUIRED");
      expect(db.mcpGrant.findMany).not.toHaveBeenCalled();
      expect(db.mcpGrant.findFirst).not.toHaveBeenCalled();
      expect(store.revokeByGrantId).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed IDs and hides the existence of another owner's grant", async () => {
    const { service, db, store } = setup();
    await expect(service.list(userId, "bad")).rejects.toThrow(
      "INVALID_REQUEST",
    );
    await expect(service.revoke(userId, "bad")).rejects.toThrow(
      "INVALID_REQUEST",
    );
    db.mcpGrant.findFirst.mockResolvedValue(null);
    await expect(service.revoke(userId, id)).rejects.toThrow("NOT_FOUND");
    expect(db.mcpGrant.findFirst).toHaveBeenCalledWith({
      where: { id, userId },
      select: { id: true, providerGrantId: true },
    });
    expect(db.mcpGrant.updateMany).not.toHaveBeenCalled();
    expect(store.revokeByGrantId).not.toHaveBeenCalled();
  });
  it("commits application denial before shared protocol revocation and is idempotent", async () => {
    const { service, db, store } = setup();
    expect(await service.revoke(userId, id)).toEqual({ revoked: true });
    expect(db.mcpGrant.updateMany).toHaveBeenCalledWith({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: at },
    });
    expect(db.mcpGrant.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      store.revokeByGrantId.mock.invocationCallOrder[0],
    );
    expect(store.revokeByGrantId).toHaveBeenCalledWith("protocol-grant");
    db.mcpGrant.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.revoke(userId, id)).toEqual({ revoked: true });
    expect(store.revokeByGrantId).toHaveBeenCalledTimes(2);
  });
  it("sanitizes store failures, keeps denial committed, and permits cleanup retry", async () => {
    const { service, db, store } = setup();
    store.revokeByGrantId.mockRejectedValueOnce(new Error("private-token"));
    await expect(service.revoke(userId, id)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(db.mcpGrant.updateMany).toHaveBeenCalledOnce();
    expect(await service.revoke(userId, id)).toEqual({ revoked: true });
    db.mcpGrant.findMany.mockRejectedValue(new Error("private-birth"));
    await expect(service.list(userId)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
  });
  it("does not attempt protocol cleanup if committing application denial fails", async () => {
    const { service, db, store } = setup();
    db.mcpGrant.updateMany.mockRejectedValue(new Error("private"));
    await expect(service.revoke(userId, id)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(store.revokeByGrantId).not.toHaveBeenCalled();
  });
});

describe("connection profile reduction", () => {
  it("only writes a subset with owner, lifetime and compare-and-swap conditions", async () => {
    const { service, db, store } = setup();
    db.mcpGrant.findFirst.mockResolvedValue({
      allowedProfileIds: ["one", "two"],
    });
    expect(await service.reduceProfiles(userId, id, ["two"])).toEqual({
      updated: true,
    });
    expect(db.mcpGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id,
        userId,
        revokedAt: null,
        expiresAt: { gt: at },
        allowedProfileIds: { equals: ["one", "two"] },
      },
      data: { allowedProfileIds: ["two"] },
    });
    expect(db.mcpGrant.findFirst).toHaveBeenCalledWith({
      where: {
        id,
        userId,
        revokedAt: null,
        createdAt: { lte: at },
        expiresAt: { gt: at },
      },
      select: { allowedProfileIds: true },
    });
    expect(store.revokeByGrantId).not.toHaveBeenCalled();
  });
  it("allows removing every profile but never adds a new or removed ID", async () => {
    const { service, db } = setup();
    db.mcpGrant.findFirst.mockResolvedValue({ allowedProfileIds: ["one"] });
    await expect(service.reduceProfiles(userId, id, ["two"])).rejects.toThrow(
      "INVALID_REQUEST",
    );
    expect(db.mcpGrant.updateMany).not.toHaveBeenCalled();
    expect(await service.reduceProfiles(userId, id, [])).toEqual({
      updated: true,
    });
  });
  it("rejects a lost race with another reduction, revocation, deletion or expiry", async () => {
    const { service, db } = setup();
    db.mcpGrant.findFirst.mockResolvedValue({
      allowedProfileIds: ["one", "two"],
    });
    db.mcpGrant.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reduceProfiles(userId, id, ["one"])).rejects.toThrow(
      "INVALID_REQUEST",
    );
    expect(db.mcpGrant.updateMany).toHaveBeenCalledOnce();
  });
  it.each(
    [null, ["one", "one"], [""], ["x".repeat(513)], Array(101).fill("one")].map(
      (profiles) => ({ profiles }),
    ),
  )("rejects malformed selection before IO: %j", async ({ profiles }) => {
    const { service, db } = setup();
    await expect(service.reduceProfiles(userId, id, profiles)).rejects.toThrow(
      "INVALID_REQUEST",
    );
    expect(db.mcpGrant.findFirst).not.toHaveBeenCalled();
  });
  it("rejects absent/other-owner/expired connections and sanitizes DB failure", async () => {
    const { service, db } = setup();
    db.mcpGrant.findFirst.mockResolvedValue(null);
    await expect(service.reduceProfiles(userId, id, [])).rejects.toThrow(
      "NOT_FOUND",
    );
    db.mcpGrant.findFirst.mockRejectedValue(new Error("private"));
    await expect(service.reduceProfiles(userId, id, [])).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
    expect(db.mcpGrant.updateMany).not.toHaveBeenCalled();
    await expect(
      service.reduceProfiles("dev-bypass-id", id, []),
    ).rejects.toThrow("LOGIN_REQUIRED");
  });
});
