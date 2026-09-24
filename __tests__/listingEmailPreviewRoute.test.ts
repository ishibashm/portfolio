// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getAuthUser: vi.fn(), $queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: mocks.$queryRaw } }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mocks.getAuthUser,
  toUserId: (u: { id: string }) => u.id,
}));
import { POST } from "@/app/api/relocation/email-preview/route";
const request = (body: unknown, origin = "https://example.com") =>
  new NextRequest("https://example.com/api/relocation/email-preview", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAuthUser.mockResolvedValue({ id: "owner" });
  mocks.$queryRaw.mockResolvedValue([{ hits: 1 }]);
});
afterEach(() => vi.restoreAllMocks());
it("requires authentication and same origin before parsing", async () => {
  expect((await POST(request({}, "https://evil.com"))).status).toBe(403);
  mocks.getAuthUser.mockResolvedValue(null);
  const result = await POST(request({ source: "private", format: "text" }));
  expect(result.status).toBe(401);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(mocks.$queryRaw).not.toHaveBeenCalled();
});
it("returns only URLs; never fetches, logs or writes content to DB", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const logs = [
    vi.spyOn(console, "log"),
    vi.spyOn(console, "error"),
    vi.spyOn(console, "warn"),
  ];
  const response = await POST(
    request({
      source: "PRIVATE_BODY https://suumo.jp/a?utm_source=mail",
      format: "text",
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    urls: ["https://suumo.jp/a"],
    truncated: false,
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(fetch).not.toHaveBeenCalled();
  logs.forEach((log) => expect(log).not.toHaveBeenCalled());
  expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mocks.$queryRaw.mock.calls)).not.toMatch(
    /PRIVATE_BODY|suumo/,
  );
});
it("bounds body/schema and rate; fixed errors do not echo text", async () => {
  for (const body of [
    { source: "x".repeat(17000), format: "text" },
    { source: "PRIVATE_BODY", format: "mime" },
    { source: "x", format: "text", userId: "other" },
  ]) {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("PRIVATE_BODY");
  }
  mocks.$queryRaw.mockResolvedValue([{ hits: 11 }]);
  const response = await POST(request({ source: "x", format: "text" }));
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
});
it("does not leak dependency error details", async () => {
  const log = vi.spyOn(console, "error");
  mocks.$queryRaw.mockRejectedValue(new Error("PRIVATE_BODY"));
  const response = await POST(request({ source: "x", format: "text" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE_BODY");
  expect(log).not.toHaveBeenCalled();
});
