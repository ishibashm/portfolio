import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const { contactCount, deleteMany, askCount, updateMany } = vi.hoisted(() => ({
  contactCount: vi.fn(),
  deleteMany: vi.fn(),
  askCount: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    contact_messages: { count: contactCount, deleteMany },
    user_configs: { count: askCount, updateMany },
  },
}));
import {
  contactRetentionCutoff,
  runContactRetention,
} from "@/lib/retention/contactRetention";
import { askDataExpiry, askDataCutoff } from "@/lib/retention/askDataExpiry";
import { runAskDataRetention } from "@/lib/retention/askDataRetention";
const now = new Date("2026-11-17T00:00:00Z");
const lastUsed = new Date("2026-08-19T00:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  contactCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
  askCount.mockResolvedValueOnce(4).mockResolvedValueOnce(5);
  deleteMany.mockResolvedValue({ count: 2 });
  updateMany.mockResolvedValue({ count: 4 });
});
afterEach(() => vi.unstubAllEnvs());

describe("90日の境界と事前案内", () => {
  it("同じ瞬間を期限と清掃に使う", () => {
    expect(contactRetentionCutoff(now)).toEqual(lastUsed);
    expect(askDataCutoff(now)).toEqual(lastUsed);
    expect(askDataExpiry(lastUsed, now)).toEqual({
      expiresAt: now.toISOString(),
      noticeAt: "2026-11-03T00:00:00.000Z",
      status: "expired",
    });
    expect(
      askDataExpiry(lastUsed, new Date("2026-11-03T00:00:00Z"))?.status,
    ).toBe("notice");
    expect(
      askDataExpiry(lastUsed, new Date("2026-11-02T23:59:59.999Z"))?.status,
    ).toBe("active");
    expect(askDataExpiry(null, now)).toBeNull();
  });
});

for (const flag of [undefined, "false", "true"]) {
  for (const dryRun of [undefined, true, false]) {
    it(`CONTACT: flag=${flag}, dryRun=${dryRun} の二重ガード`, async () => {
      vi.stubEnv("CONTACT_RETENTION_ENABLED", flag);
      const result = await runContactRetention({ dryRun, now });
      expect(result.unknownResolvedAtCount).toBe(3);
      expect(contactCount).toHaveBeenNthCalledWith(1, {
        where: { handled: true, resolved_at: { lte: lastUsed } },
      });
      expect(contactCount).toHaveBeenNthCalledWith(2, {
        where: { handled: true, resolved_at: null },
      });
      expect(deleteMany).toHaveBeenCalledTimes(
        flag === "true" && dryRun === false ? 1 : 0,
      );
      if (flag === "true" && dryRun === false)
        expect(deleteMany).toHaveBeenCalledWith({
          where: { handled: true, resolved_at: { lte: lastUsed } },
        });
    });
    it(`ASK: flag=${flag}, dryRun=${dryRun} の二重ガード`, async () => {
      vi.stubEnv("ASK_DATA_RETENTION_ENABLED", flag);
      const result = await runAskDataRetention({ dryRun, now });
      expect(result.unknownLastUsedAtCount).toBe(5);
      expect(askCount).toHaveBeenNthCalledWith(2, {
        where: {
          ask_data: { not: Prisma.DbNull },
          ask_data_last_used_at: null,
        },
      });
      expect(updateMany).toHaveBeenCalledTimes(
        flag === "true" && dryRun === false ? 1 : 0,
      );
      if (flag === "true" && dryRun === false)
        expect(updateMany).toHaveBeenCalledWith({
          where: {
            ask_data: { not: Prisma.DbNull },
            ask_data_last_used_at: { lte: lastUsed },
          },
          data: { ask_data: Prisma.DbNull },
        });
    });
  }
}
