// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  user: vi.fn(),
  config: vi.fn(),
  tx: vi.fn(),
  lock: vi.fn(),
  candidates: vi.fn(),
  rates: vi.fn(),
  deleteConfig: vi.fn(),
  spots: vi.fn(),
  analyses: vi.fn(),
  favoriteDays: vi.fn(),
  reminders: vi.fn(),
  consents: vi.fn(),
  tables: vi.fn(),
  revoke: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: { $transaction: mock.tx } }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mock.user,
  toUserId: (u: { id: string }) => u.id,
  findUserConfig: mock.config,
}));
import { DELETE } from "@/app/api/user-config/route";
const id = "11111111-2222-4333-8444-555555555555";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MCP_RUNTIME_CONFIG", "");
  vi.stubEnv("MCP_PERSONAL_ENABLED", "false");
  mock.user.mockResolvedValue({ id });
  mock.config.mockResolvedValue(null);
  mock.tables.mockResolvedValue([{ reminders: true, consents: true }]);
  mock.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: mock.lock,
      $queryRaw: mock.tables,
      listingCandidate: { deleteMany: mock.candidates },
      listingCandidateRate: { deleteMany: mock.rates },
      user_configs: { delete: mock.deleteConfig },
      userSpot: { deleteMany: mock.spots },
      savedAnalysis: { deleteMany: mock.analyses },
      favoriteDay: { deleteMany: mock.favoriteDays },
      reminder: { deleteMany: mock.reminders },
      notificationConsent: { deleteMany: mock.consents },
      mcpGrant: { updateMany: mock.revoke },
      mcpAccessAudit: { create: mock.audit },
    }),
  );
});
it("clears only the owner's candidates even if no user_config exists", async () => {
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(200);
  expect(mock.candidates).toHaveBeenCalledWith({ where: { userId: id } });
  expect(mock.deleteConfig).not.toHaveBeenCalled();
  expect(mock.lock).toHaveBeenCalled();
});
it("also clears the owner's saved spots, saved analyses and favorite days", async () => {
  /* 以前は user_spots が残っていた。画面は「すべて消す」と書いている */
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(200);
  expect(mock.spots).toHaveBeenCalledWith({ where: { user_id: id } });
  expect(mock.analyses).toHaveBeenCalledWith({ where: { user_id: id } });
  expect(mock.favoriteDays).toHaveBeenCalledWith({ where: { user_id: id } });
});
it("also clears the owner's reminders and email consent records", async () => {
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(200);
  expect(mock.reminders).toHaveBeenCalledWith({ where: { user_id: id } });
  expect(mock.consents).toHaveBeenCalledWith({ where: { user_id: id } });
});
it("still deletes when the reminder tables are not created yet", async () => {
  mock.tables.mockResolvedValue([{ reminders: false, consents: false }]);
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(200);
  expect(mock.reminders).not.toHaveBeenCalled();
  expect(mock.favoriteDays).toHaveBeenCalled();
});
it("does not clear registered data from another origin", async () => {
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://evil.example" },
    }),
  );
  expect(res.status).toBe(403);
  expect(mock.tx).not.toHaveBeenCalled();
});

afterEach(() => vi.unstubAllEnvs());
it("revokes every owner grant in the deletion transaction even while the endpoint is disabled", async () => {
  vi.stubEnv("MCP_RUNTIME_CONFIG", "TEST_ONLY_CONFIG_PRESENT");
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(200);
  expect(mock.revoke).toHaveBeenCalledWith({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: expect.any(Date) },
  });
  expect(mock.audit.mock.calls[0][0].data).toMatchObject({
    userId: id,
    grantId: null,
    event: "revoke",
    result: "revoked",
  });
  expect(mock.lock.mock.invocationCallOrder[0]).toBeLessThan(
    mock.revoke.mock.invocationCallOrder[0],
  );
  expect(mock.revoke.mock.invocationCallOrder[0]).toBeLessThan(
    mock.candidates.mock.invocationCallOrder[0],
  );
});
it("does not delete registration when revocation fails", async () => {
  vi.stubEnv("MCP_RUNTIME_CONFIG", "TEST_ONLY_CONFIG_PRESENT");
  mock.revoke.mockRejectedValue(new Error("TEST_ONLY_PRIVATE_DB_ERROR"));
  const res = await DELETE(
    new NextRequest("https://example.com/api/user-config", {
      method: "DELETE",
      headers: { origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(500);
  expect(await res.text()).not.toContain("PRIVATE_DB_ERROR");
  expect(mock.candidates).not.toHaveBeenCalled();
});
