// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  user: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
  tx: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    $executeRaw: mock.execute,
    $queryRaw: mock.query,
    $transaction: mock.tx,
  },
}));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mock.user,
  toUserId: (u: { id: string }) => u.id,
}));
import { POST as connect } from "@/app/api/relocation/email/gmail/connect/route";
import { GET as callback } from "@/app/api/relocation/email/gmail/callback/route";
import { POST as read } from "@/app/api/relocation/email/gmail/read/route";
import { POST as disconnect } from "@/app/api/relocation/email/gmail/disconnect/route";
import { GmailListingEmailReader } from "@/lib/gmail/reader";
const owner = "11111111-2222-4333-8444-555555555555";
const request = (
  path = "connect",
  options: { origin?: string; cookie?: string; body?: unknown } = {},
) =>
  new NextRequest(`https://example.com/api/relocation/email/gmail/${path}`, {
    method: path.startsWith("callback") ? "GET" : "POST",
    headers: {
      origin: options.origin ?? "https://example.com",
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "LISTING_EMAIL_GOOGLE_REDIRECT_URI",
    "https://example.com/api/relocation/email/gmail/callback",
  );
  vi.stubEnv(
    "LISTING_EMAIL_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  vi.stubEnv("LISTING_EMAIL_ENCRYPTION_KEY_ID", "v1");
  mock.user.mockResolvedValue({ id: owner });
  mock.query.mockResolvedValue([{ hits: 1 }]);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("NETWORK_FORBIDDEN"),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("read route returns selected URL candidates only, never raw MIME", async () => {
  const spy = vi
    .spyOn(GmailListingEmailReader.prototype, "read")
    .mockResolvedValue({
      messages: [
        {
          rawMime:
            "Content-Type: text/plain\r\n\r\nPRIVATE_BODY https://suumo.jp/a",
        },
      ],
      nextCursor: null,
    });
  const response = await read(
    request("read", {
      body: {
        connectionId: owner,
        labelId: "Label_rental",
        startedAt: "2026-09-24T00:00:00.000Z",
        maxMessages: 20,
        cursor: null,
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    urls: ["https://suumo.jp/a"],
    truncated: false,
    nextCursor: null,
  });
  expect(spy.mock.calls[0][0]).toBe(owner);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each([connect, callback, read, disconnect])(
  "OFF route refuses before auth/DB/network",
  async (route) => {
    vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "");
    const response = await route(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "GMAIL_DISABLED" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mock.user).not.toHaveBeenCalled();
    expect(mock.query).not.toHaveBeenCalled();
    expect(mock.execute).not.toHaveBeenCalled();
    expect(mock.tx).not.toHaveBeenCalled();
  },
);
it("connect requires authentication and same-origin CSRF protection", async () => {
  expect(
    (await connect(request("connect", { origin: "https://evil.com" }))).status,
  ).toBe(403);
  mock.user.mockResolvedValue(null);
  expect((await connect(request())).status).toBe(401);
  expect(mock.execute).not.toHaveBeenCalled();
});
it("connect/callback are non-network stubs; state is browser/owner-bound, expires and is single-use", async () => {
  let pending: unknown[] | null = null;
  mock.execute.mockImplementation(
    async (sql: TemplateStringsArray, ...args: unknown[]) => {
      if (sql.join("").includes("INSERT")) {
        pending = args;
        return 1;
      }
      if (pending && JSON.stringify(pending) === JSON.stringify(args)) {
        pending = null;
        return 1;
      }
      return 0;
    },
  );
  const response = await connect(request());
  const result = await response.json();
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  expect(result.code).toBe("OAUTH_STUB");
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
  expect(response.headers.get("set-cookie")).toMatch(/Secure/);
  expect(JSON.stringify(mock.execute.mock.calls)).not.toContain(result.state);
  expect(
    (await callback(request(`callback?state=${result.state}`))).status,
  ).toBe(403);
  expect(
    (await callback(request(`callback?state=${"x".repeat(43)}`, { cookie })))
      .status,
  ).toBe(403);
  mock.user.mockResolvedValue({ id: "other" });
  expect(
    (await callback(request(`callback?state=${result.state}`, { cookie })))
      .status,
  ).toBe(403);
  mock.user.mockResolvedValue({ id: owner });
  const accepted = await callback(
    request(`callback?state=${result.state}&code=SECRET_AUTH_CODE`, { cookie }),
  );
  expect(accepted.status).toBe(501);
  expect(await accepted.json()).toEqual({
    code: "OAUTH_STUB",
    connected: false,
  });
  expect(accepted.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(
    (await callback(request(`callback?state=${result.state}`, { cookie })))
      .status,
  ).toBe(403);
  expect(JSON.stringify(mock.execute.mock.calls)).not.toContain(
    "SECRET_AUTH_CODE",
  );
  expect(mock.execute.mock.calls.at(-1)![0].join("")).toContain(
    '"expiresAt" > now()',
  );
});
it("callback rejects expired and duplicate state values", async () => {
  mock.execute.mockResolvedValue(0);
  const state = "s".repeat(43);
  const cookie = `__Host-listing-email-oauth=${"b".repeat(43)}`;
  expect(
    (await callback(request(`callback?state=${state}`, { cookie }))).status,
  ).toBe(403);
  mock.execute.mockClear();
  expect(
    (
      await callback(
        request(`callback?state=${state}&state=${state}`, { cookie }),
      )
    ).status,
  ).toBe(403);
  expect(mock.execute).not.toHaveBeenCalled();
});
it("invalid body/foreign origin cannot reach a reader; missing config is fixed error", async () => {
  expect(
    (await read(request("read", { body: { userId: "other" } }))).status,
  ).toBe(400);
  expect(
    (await disconnect(request("disconnect", { origin: "https://evil.com" })))
      .status,
  ).toBe(403);
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_SECRET", "");
  expect((await connect(request())).status).toBe(503);
  expect(mock.tx).not.toHaveBeenCalled();
});
