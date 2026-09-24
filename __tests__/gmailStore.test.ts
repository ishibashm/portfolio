// @vitest-environment node
import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  tx: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: { $transaction: db.tx } }));
import { gmailConnectionStore } from "@/lib/gmail/store";
it("locks by owner and connection, writes only ciphertext, and deletes with the same owner condition", async () => {
  db.query.mockResolvedValue([
    { id: "connection", userId: "owner", sealedState: "sealed" },
  ]);
  db.tx.mockImplementation(async (operation) =>
    operation({ $queryRaw: db.query, $executeRaw: db.execute }),
  );
  await gmailConnectionStore.withConnection(
    "owner",
    "connection",
    async (record, save) => {
      expect(record?.userId).toBe("owner");
      await save("ciphertext");
      await save("selected-ciphertext", {
        labelId: "Label_1",
        startedAt: new Date("2026-09-24T00:00:00.000Z"),
      });
      await save(null);
    },
  );
  expect(db.query.mock.calls[0].slice(1)).toEqual(["connection", "owner"]);
  expect(db.query.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  expect(db.execute.mock.calls[0].slice(1)).toEqual([
    "ciphertext",
    "connection",
    "owner",
  ]);
  expect(db.execute.mock.calls[1].slice(1)).toEqual([
    "selected-ciphertext",
    "Label_1",
    new Date("2026-09-24T00:00:00.000Z"),
    "connection",
    "owner",
  ]);
  expect(db.execute.mock.calls[2].slice(1)).toEqual(["connection", "owner"]);
  expect(db.tx.mock.calls[0][1]).toEqual({ timeout: 30000, maxWait: 5000 });
});
