import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createMemoryStore,
  memoryInput,
  memoryEnabled,
} from "@/lib/personalMemory";
import { createMcpStateCrypto } from "@/lib/mcpStateCrypto";

const userId = "11111111-1111-4111-8111-111111111111";
const crypto = createMcpStateCrypto({
  lookupKey: Buffer.alloc(32, 1),
  activeVersion: "v1",
  encryptionKeys: new Map([["v1", Buffer.alloc(32, 2)]]),
});
const note = { title: "家族の部屋", text: "北東", category: "family" };
function fixture(count = 0) {
  const tx = {
    $executeRaw: vi.fn(),
    memoryEntry: {
      count: vi.fn().mockResolvedValue(count),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const db = {
    $transaction: (fn: (arg: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaClient;
  return { tx, store: createMemoryStore(db, crypto) };
}
describe("private memory", () => {
  it("is disabled unless explicitly enabled and bounds UTF8 bytes", () => {
    vi.stubEnv("MCP_MEMORY_ENABLED", "false");
    expect(memoryEnabled()).toBe(false);
    expect(
      memoryInput.safeParse({ ...note, text: "あ".repeat(3000) }).success,
    ).toBe(false);
    vi.unstubAllEnvs();
  });
  it("persists ciphertext bound to both owner and row", async () => {
    const { store, tx } = fixture();
    await store.run(userId, "create", note);
    const row = tx.memoryEntry.create.mock.calls[0][0].data;
    expect(row.payload.toString()).not.toContain(note.title);
    expect(crypto.open("MemoryEntry", `${userId}:${row.id}`, row)).toEqual(
      note,
    );
    expect(() => crypto.open("MemoryEntry", `other:${row.id}`, row)).toThrow();
    expect(() => crypto.open("MemoryEntry", `${userId}:other`, row)).toThrow();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("enforces quota without writing", async () => {
    const { store, tx } = fixture(100);
    await expect(store.run(userId, "create", note)).rejects.toThrow(
      "LIMIT_REACHED",
    );
    expect(tx.memoryEntry.create).not.toHaveBeenCalled();
  });
  it("does not overwrite stale revisions or another owner's entry", async () => {
    const { store, tx } = fixture();
    const id = "22222222-2222-4222-8222-222222222222";
    await expect(
      store.run(userId, "update", { id, revision: 1, value: note }),
    ).rejects.toThrow("NOT_FOUND_OR_CONFLICT");
    expect(tx.memoryEntry.updateMany.mock.calls[0][0].where).toEqual({
      id,
      userId,
      revision: 1,
    });
  });
  it("filters reads and deletes by verified owner and suppresses raw DB errors", async () => {
    const { store, tx } = fixture();
    await store.run(userId, "list");
    expect(tx.memoryEntry.findMany.mock.calls[0][0].where).toEqual({ userId });
    tx.memoryEntry.deleteMany.mockRejectedValue(new Error("SECRET"));
    await expect(store.run(userId, "clear")).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
  });
});
