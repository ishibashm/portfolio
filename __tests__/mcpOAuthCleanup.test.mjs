// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { cleanupOAuthState } from "../oauth-service/cleanup.mjs";

describe("OAuth state retention cleanup", () => {
  it("previews by default and only deletes expired rows on explicit apply", async () => {
    const prisma = {
      mcpOauthRecord: {
        count: vi.fn().mockResolvedValue(2),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      mcpOauthConnection: {
        count: vi.fn().mockResolvedValue(1),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const now = new Date("2026-10-11T00:00:00Z");
    expect(await cleanupOAuthState(prisma, now)).toEqual({
      dryRun: true,
      records: 2,
      connections: 1,
    });
    expect(prisma.mcpOauthRecord.deleteMany).not.toHaveBeenCalled();
    expect(await cleanupOAuthState(prisma, now, true)).toEqual({
      dryRun: false,
      records: 2,
      connections: 1,
    });
    expect(prisma.mcpOauthRecord.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(prisma.mcpOauthConnection.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date("2026-09-11T00:00:00Z") } },
    });
  });
});
