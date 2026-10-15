// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  createMcpConsentGrantWriter,
  revokeMcpOnRegistrationDeletion,
} from "@/lib/mcpDeletion";
import { mcpPersistence } from "./helpers/mcpPersistence";
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const data = {
  id: "33333333-3333-4333-8333-333333333333",
  userId,
  providerGrantId: "TEST_PROVIDER_ID",
  clientId: "test",
  allowedProfileIds: ["one"],
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86400000),
  revokedAt: null,
  lastUsedAt: null,
};
const profiles = [{ id: "one", name: "Selected" }];
afterEach(() => vi.unstubAllEnvs());
it("locks the same owner as registration deletion and rereads profiles before persisting consent", async () => {
  const { db, app } = mcpPersistence();
  const read = vi.fn().mockResolvedValue({ presets: profiles });
  Object.assign(db, { user_configs: { findFirst: read } });
  await createMcpConsentGrantWriter(db)(data, profiles);
  expect(db.$executeRaw).toHaveBeenCalledWith(
    expect.arrayContaining([expect.stringContaining("pg_advisory_xact_lock")]),
    userId,
  );
  expect(read).toHaveBeenCalledWith({
    where: { user_id: userId },
    select: { presets: true },
  });
  expect(vi.mocked(db.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(
    read.mock.invocationCallOrder[0],
  );
  expect(read.mock.invocationCallOrder[0]).toBeLessThan(
    app.create.mock.invocationCallOrder[0],
  );
});
it.each([
  null,
  { presets: [] },
  { presets: [{ id: "one", name: "Replaced" }] },
  { presets: "invalid" },
])("rejects consent after deletion or replacement (%j)", async (row) => {
  const { db, app } = mcpPersistence();
  Object.assign(db, {
    user_configs: { findFirst: vi.fn().mockResolvedValue(row) },
  });
  await expect(createMcpConsentGrantWriter(db)(data, profiles)).rejects.toThrow(
    "INVALID_REQUEST",
  );
  expect(app.create).not.toHaveBeenCalled();
});
it("denies old grants after deletion, keeps other owners, and does not revive them on repeat", async () => {
  vi.stubEnv("MCP_RUNTIME_CONFIG", "TEST_ONLY_CONFIG_PRESENT");
  vi.stubEnv("MCP_PERSONAL_ENABLED", "false");
  const { db, grants } = mcpPersistence();
  const audit = vi.fn();
  Object.assign(db, { mcpAccessAudit: { create: audit } });
  grants.set(data.id, { ...data });
  grants.set("other", { ...data, id: "other", userId: otherId });
  await revokeMcpOnRegistrationDeletion(db, userId);
  const revokedAt = grants.get(data.id)!.revokedAt;
  expect(revokedAt).toBeInstanceOf(Date);
  expect(grants.get("other")!.revokedAt).toBeNull();
  await revokeMcpOnRegistrationDeletion(db, userId);
  expect(grants.get(data.id)!.revokedAt).toEqual(revokedAt);
  expect(JSON.stringify(audit.mock.calls)).not.toContain("TEST_PROVIDER_ID");
  expect(JSON.stringify(audit.mock.calls)).not.toContain("Selected");
});
it("does not require unapplied MCP tables before deployment is configured", async () => {
  vi.stubEnv("MCP_RUNTIME_CONFIG", "");
  vi.stubEnv("MCP_PERSONAL_ENABLED", "false");
  const { db, app } = mcpPersistence();
  await revokeMcpOnRegistrationDeletion(db, userId);
  expect(app.updateMany).not.toHaveBeenCalled();
});
