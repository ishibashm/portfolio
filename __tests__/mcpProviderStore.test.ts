import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createMcpProviderStore,
  type McpStateRow,
} from "@/lib/mcpProviderStore";

const at = new Date("2026-10-11T00:00:00Z");
function row(
  model = "RefreshToken",
  grantId: string | null = "grant",
): McpStateRow {
  return {
    model,
    keyHash: `${model}-hash`,
    payload: randomBytes(32),
    keyVersion: "v1",
    grantId,
    uidHash: null,
    userCodeHash: null,
    expiresAt: new Date(at.getTime() + 600_000),
    consumedAt: null,
  };
}
function setup() {
  const state = {
    findUnique: vi.fn().mockResolvedValue(row("Grant")),
    findFirst: vi.fn().mockResolvedValue(row()),
    upsert: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    mcpProviderState: state,
    mcpGrant: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: "app-grant" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
  };
  const db = {
    ...tx,
    $executeRaw: vi.fn().mockResolvedValue(2),
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const store = createMcpProviderStore({
    db: db as unknown as PrismaClient,
    grantKeyHash: () => "Grant-hash",
    now: () => at,
  });
  return { store, db, tx, state };
}

describe("MCP persistence query contract (no database connection)", () => {
  it("locks the grant, checks its liveness and never resets consumed state on upsert", async () => {
    const { store, tx, state } = setup();
    state.findUnique
      .mockResolvedValueOnce(row("Grant"))
      .mockResolvedValueOnce({ ...row(), consumedAt: at });
    await store.put(row());
    expect(tx.$queryRaw.mock.calls[0][1]).toBe("mcp-grant:grant");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      state.findUnique.mock.invocationCallOrder[0],
    );
    const query = state.upsert.mock.calls[0][0];
    expect(query.where).toEqual({
      model_keyHash: { model: "RefreshToken", keyHash: "RefreshToken-hash" },
    });
    expect(query.create.consumedAt).toBeNull();
    expect(query.update).not.toHaveProperty("consumedAt");
  });

  it("rejects saves after grant revocation or expiry, including a stale Grant save", async () => {
    for (const grant of [
      null,
      { ...row("Grant"), consumedAt: at },
      { ...row("Grant"), expiresAt: at },
    ]) {
      const { store, state } = setup();
      state.findUnique.mockResolvedValue(grant);
      await expect(store.put(row())).rejects.toThrow("MCP_STATE_UNAVAILABLE");
      expect(state.upsert).not.toHaveBeenCalled();
    }
    const { store, state } = setup();
    state.findUnique.mockResolvedValue({ ...row("Grant"), consumedAt: at });
    await expect(store.put(row("Grant"))).rejects.toThrow(
      "MCP_STATE_UNAVAILABLE",
    );
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("requires live application consent for token saves and consumes but allows the initial protocol Grant", async () => {
    const { store, tx, state } = setup();
    tx.mcpGrant.findFirst.mockResolvedValue(null);
    await expect(store.put(row())).rejects.toThrow("MCP_STATE_UNAVAILABLE");
    expect(await store.consume("RefreshToken", "RefreshToken-hash")).toBe(
      false,
    );
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.updateMany).not.toHaveBeenCalled();
    expect(tx.mcpGrant.findFirst).toHaveBeenCalledWith({
      where: {
        providerGrantId: "grant",
        revokedAt: null,
        createdAt: { lte: at },
        expiresAt: { gt: at },
      },
      select: { id: true },
    });
    state.findUnique.mockResolvedValue(null);
    await store.put(row("Grant"));
    expect(state.upsert).toHaveBeenCalledOnce();
  });

  it("sanitizes application consent lookup failures without issuing tokens", async () => {
    const { store, tx, state } = setup();
    tx.mcpGrant.findFirst.mockRejectedValue(
      new Error("private-database-input"),
    );
    await expect(store.put(row())).rejects.toThrow("MCP_STATE_UNAVAILABLE");
    await expect(store.consume("RefreshToken", "hash")).rejects.toThrow(
      "MCP_STATE_UNAVAILABLE",
    );
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it("does not allow a saved token to move to another grant", async () => {
    const { store, state } = setup();
    state.findUnique
      .mockResolvedValueOnce(row("Grant"))
      .mockResolvedValueOnce(row("RefreshToken", "other"));
    await expect(store.put(row())).rejects.toThrow("MCP_STATE_UNAVAILABLE");
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("uses a conditional atomic consume and commits revocation for the losing request", async () => {
    const { store, state, tx } = setup();
    state.findUnique.mockImplementation(async ({ where }) =>
      where.model_keyHash.model === "Grant" ? row("Grant") : row(),
    );
    state.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    // Mocked atomic update outcomes, not a substitute for Postgres contention tests.
    expect(await store.consume("RefreshToken", "RefreshToken-hash")).toBe(true);
    expect(await store.consume("RefreshToken", "RefreshToken-hash")).toBe(
      false,
    );
    expect(state.updateMany.mock.calls[0][0]).toEqual({
      where: {
        model: "RefreshToken",
        keyHash: "RefreshToken-hash",
        consumedAt: null,
        expiresAt: { gt: at },
      },
      data: { consumedAt: at },
    });
    expect(tx.mcpGrant.updateMany).toHaveBeenCalledWith({
      where: { providerGrantId: "grant", revokedAt: null },
      data: { revokedAt: at },
    });
    expect(state.deleteMany).toHaveBeenCalledWith({
      where: { grantId: "grant", model: { not: "Grant" } },
    });
    expect(state.updateMany).toHaveBeenLastCalledWith({
      where: { model: "Grant", keyHash: "Grant-hash", consumedAt: null },
      data: { consumedAt: at },
    });
  });

  it("does not consume missing state or a token whose grant has disappeared", async () => {
    const { store, state } = setup();
    state.findUnique.mockResolvedValue(null);
    expect(await store.consume("AuthorizationCode", "missing")).toBe(false);
    state.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    expect(await store.consume("RefreshToken", "RefreshToken-hash")).toBe(
      false,
    );
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it("uses the same lock and tombstone for Grant destroy and grant-wide revoke", async () => {
    const { store, tx, state } = setup();
    await store.destroy("Grant", "Grant-hash", "grant");
    await store.revokeByGrantId("grant");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.mcpGrant.updateMany).toHaveBeenCalledTimes(2);
    expect(state.deleteMany).toHaveBeenCalledTimes(2);
    await expect(store.destroy("Grant", "wrong", "grant")).rejects.toThrow(
      "MCP_STATE_UNAVAILABLE",
    );
    await store.destroy("Session", "session-hash");
    expect(state.deleteMany).toHaveBeenLastCalledWith({
      where: { model: "Session", keyHash: "session-hash" },
    });
  });

  it("keeps consumed token markers visible but hides expired and revoked grants", async () => {
    const { store, state } = setup();
    state.findFirst.mockResolvedValue({ ...row(), consumedAt: at });
    expect(
      await store.find("RefreshToken", { keyHash: "hash" }),
    ).toHaveProperty("consumedAt", at);
    state.findFirst.mockResolvedValue({ ...row("Grant"), consumedAt: at });
    expect(await store.find("Grant", { keyHash: "hash" })).toBeUndefined();
    state.findFirst.mockResolvedValue({
      ...row("Session", null),
      expiresAt: at,
    });
    expect(await store.find("Session", { uidHash: "hash" })).toBeUndefined();
    expect(state.findFirst).toHaveBeenLastCalledWith({
      where: { model: "Session", uidHash: "hash", expiresAt: { gt: at } },
    });
  });

  it("claims once with a unique insert in a separate namespace, independent of interaction upserts", async () => {
    const { store, state } = setup();
    const claim = row("InteractionClaim", null);
    state.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    expect(await store.claim(claim)).toBe(true);
    expect(await store.claim(claim)).toBe(false);
    expect(state.createMany).toHaveBeenCalledWith({
      data: [claim],
      skipDuplicates: true,
    });
    expect(state.findUnique).not.toHaveBeenCalled();
    for (const invalid of [
      row(),
      { ...claim, expiresAt: at },
      { ...claim, expiresAt: new Date(at.getTime() + 600_001) },
    ]) {
      await expect(store.claim(invalid)).rejects.toThrow(
        "MCP_STATE_UNAVAILABLE",
      );
    }
  });

  it("bounds expiry cleanup and never interpolates values into SQL", async () => {
    const { store, db } = setup();
    expect(await store.purgeExpired(20)).toBe(2);
    const [sql, date, limit] = db.$executeRaw.mock.calls[0];
    expect(sql.join("?")).toContain('"expiresAt" <= ?');
    expect(sql.join("?")).toContain("FOR UPDATE SKIP LOCKED");
    expect(date).toEqual(at);
    expect(limit).toBe(20);
    for (const invalid of [0, -1, 1001, 1.5])
      await expect(store.purgeExpired(invalid)).rejects.toThrow(
        "MCP_STATE_UNAVAILABLE",
      );
  });

  it("sanitizes backend failures without a cause or log", async () => {
    const { store, state } = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.findFirst.mockRejectedValue(new Error("synthetic raw DB secret"));
      await expect(
        store.find("Session", { keyHash: "hash" }),
      ).rejects.toMatchObject({ message: "MCP_STATE_UNAVAILABLE" });
      await store
        .find("Session", { keyHash: "hash" })
        .catch((error: Error) => expect(error.cause).toBeUndefined());
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
