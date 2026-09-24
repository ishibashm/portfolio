// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  user: vi.fn(),
  config: vi.fn(),
  tx: vi.fn(),
  lock: vi.fn(),
  candidates: vi.fn(),
  rates: vi.fn(),
  deleteConfig: vi.fn(),
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
  mock.user.mockResolvedValue({ id });
  mock.config.mockResolvedValue(null);
  mock.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: mock.lock,
      listingCandidate: { deleteMany: mock.candidates },
      listingCandidateRate: { deleteMany: mock.rates },
      user_configs: { delete: mock.deleteConfig },
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
