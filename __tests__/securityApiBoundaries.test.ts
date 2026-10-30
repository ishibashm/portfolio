// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  getUser: vi.fn(),
  query: vi.fn(),
  create: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/lib/adminApi", () => ({ denyUnlessAdmin: mocks.admin }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRaw: mocks.query,
    contact_messages: { create: mocks.create },
    agentActivityLog: { findFirst: mocks.log },
  },
}));
vi.mock("ai", () => ({ embed: async () => ({ embedding: [0.1, 0.2] }) }));
vi.mock("@ai-sdk/google", () => ({
  google: { textEmbeddingModel: () => "mock" },
}));
vi.mock("@/lib/paidApis", () => ({ paidApisDisabled: () => false }));
import { POST as search } from "@/app/api/ai/search-chunks/route";
import { POST as contact } from "@/app/api/contact/route";
import { GET as latest } from "@/app/api/agent/latest-log/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(null);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-fixture" } } });
  mocks.query.mockResolvedValue([]);
  mocks.create.mockResolvedValue({});
});
const post = (body: unknown) =>
  new Request("https://example.invalid/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
it("private search denies anonymous requests before querying", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await search(post({ query: "test" }))).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("private search binds the verified owner as a SQL parameter", async () => {
  expect(
    (await search(post({ query: "test", userId: "other-owner" }))).status,
  ).toBe(200);
  const [sql, ...values] = mocks.query.mock.calls[0];
  expect(sql.join("?")).toContain("AND d.user_id = ?");
  expect(values).toContain("owner-fixture");
  expect(values).not.toContain("other-owner");
});
it("invalid search input cannot reach embedding/database work", async () => {
  expect((await search(post({ query: ["not a string"] }))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("private operational logs deny anonymous requests", async () => {
  mocks.admin.mockResolvedValue(Response.json({}, { status: 401 }));
  expect((await latest()).status).toBe(401);
  expect(mocks.log).not.toHaveBeenCalled();
});
it("contact rejects coercible objects and accepts bounded text", async () => {
  expect(
    (
      await contact(
        post({ name: {}, email: "test@example.invalid", body: "hello" }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(
    (
      await contact(
        post({ name: "Fixture", email: "test@example.invalid", body: "hello" }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
