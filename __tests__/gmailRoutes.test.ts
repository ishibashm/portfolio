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
import { createGmailHandlers } from "@/lib/gmail/routes";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import { seal, unseal } from "@/lib/gmail/security";
import { createHash } from "node:crypto";
const transport = vi.fn<typeof fetch>();
const {
  gmailConnect: connect,
  gmailCallback: callback,
  gmailRead: read,
  gmailDisconnect: disconnect,
  gmailLabels: labels,
  gmailSelectLabel: selectLabel,
} = createGmailHandlers(transport);
import { GmailAccountService } from "@/lib/gmail/account";
import { GmailListingEmailReader } from "@/lib/gmail/reader";
const owner = "11111111-2222-4333-8444-555555555555";
const request = (
  path = "connect",
  options: { origin?: string; cookie?: string; body?: unknown } = {},
) =>
  new NextRequest(`https://example.com/api/relocation/email/gmail/${path}`, {
    method:
      path.startsWith("callback") || path.startsWith("labels") ? "GET" : "POST",
    headers: {
      origin: options.origin ?? "https://example.com",
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  transport.mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "TEST_ACCESS",
        refresh_token: "TEST_REFRESH",
        token_type: "Bearer",
        expires_in: 3600,
        scope: GMAIL_READONLY_SCOPE,
      }),
    ),
  );
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
it.each([connect, callback, read, disconnect, labels, selectLabel])(
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
it("PKCE callback is browser/owner-bound and single-use; credentials only reach injected token exchange", async () => {
  let pending: unknown[] | null = null;
  mock.execute.mockImplementation(
    async (sql: TemplateStringsArray, ...args: unknown[]) => {
      if (sql.join("").includes("INSERT INTO listing_email_connections"))
        return 1;
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
  const auth = new URL(result.authorizationUrl);
  result.state = auth.searchParams.get("state");
  expect(auth.origin + auth.pathname).toBe(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  expect(auth.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
  expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
  expect(auth.searchParams.get("access_type")).toBe("offline");
  expect(auth.searchParams.get("prompt")).toBe("consent");
  const pendingCookie = unseal(
    decodeURIComponent(cookie.split("=")[1]),
    owner,
    "oauth-pending",
  ) as { verifier: string; state: string; browser: string };
  expect(auth.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(pendingCookie.verifier).digest("base64url"),
  );
  expect(pendingCookie.state).toBe(result.state);
  expect(pendingCookie.browser).toBe(auth.searchParams.get("nonce"));
  expect(result.authorizationUrl).not.toContain(pendingCookie.verifier);
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
  expect(accepted.status).toBe(303);
  const location = accepted.headers.get("location")!;
  expect(location).toMatch(
    /^https:\/\/example.com\/relocation\/arbitrage\?emailConnection=/,
  );
  expect(location).not.toMatch(/SECRET_AUTH_CODE|TEST_ACCESS|TEST_REFRESH/);
  const body = new URLSearchParams(String(transport.mock.calls[0][1]?.body));
  expect(body.get("code_verifier")).toBe(pendingCookie.verifier);
  expect(body.get("code")).toBe("SECRET_AUTH_CODE");
  expect(body.get("redirect_uri")).toBe(
    "https://example.com/api/relocation/email/gmail/callback",
  );
  expect(JSON.stringify(mock.execute.mock.calls)).not.toMatch(
    /TEST_REFRESH|TEST_ACCESS/,
  );
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

it("label endpoints require authentication, restrict mutation origin and reject caller-supplied startedAt", async () => {
  const list = vi
    .spyOn(GmailAccountService.prototype, "listLabels")
    .mockResolvedValue({ labels: [{ id: "Label_1", name: "通知" }] });
  const select = vi
    .spyOn(GmailAccountService.prototype, "selectLabel")
    .mockResolvedValue({
      selected: {
        connectionId: owner,
        labelId: "Label_1",
        startedAt: "2026-09-24T00:00:00.000Z",
      },
    });
  mock.user.mockResolvedValue(null);
  expect((await labels(request(`labels?connectionId=${owner}`))).status).toBe(
    401,
  );
  expect(list).not.toHaveBeenCalled();
  mock.user.mockResolvedValue({ id: owner });
  expect((await labels(request(`labels?connectionId=${owner}`))).status).toBe(
    200,
  );
  expect(list).toHaveBeenCalledWith(owner, owner);
  expect(
    (
      await selectLabel(
        request("select-label", {
          origin: "https://evil.com",
          body: { connectionId: owner, labelId: "Label_1" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await selectLabel(
        request("select-label", {
          body: {
            connectionId: owner,
            labelId: "Label_1",
            startedAt: "2000-01-01",
          },
        }),
      )
    ).status,
  ).toBe(400);
  expect(select).not.toHaveBeenCalled();
  expect(
    (
      await selectLabel(
        request("select-label", {
          body: { connectionId: owner, labelId: "Label_1" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(select).toHaveBeenCalledWith(owner, owner, "Label_1");
});
it("valid encrypted cookie still requires an unexpired database challenge; expired cookie avoids DB consumption", async () => {
  mock.execute.mockResolvedValue(1);
  const connected = await connect(request());
  const auth = new URL((await connected.json()).authorizationUrl);
  const state = auth.searchParams.get("state");
  const cookie = connected.headers.get("set-cookie")!.split(";")[0];
  mock.execute.mockResolvedValue(0);
  expect(
    (
      await callback(
        request(`callback?state=${state}&code=PRIVATE_CODE`, { cookie }),
      )
    ).status,
  ).toBe(403);
  expect(transport).not.toHaveBeenCalled();
  const pending = unseal(
    decodeURIComponent(cookie.split("=")[1]),
    owner,
    "oauth-pending",
  ) as Record<string, unknown>;
  const expired = `__Host-listing-email-oauth=${seal({ ...pending, expiresAt: 0 }, owner, "oauth-pending")}`;
  mock.execute.mockClear();
  expect(
    (
      await callback(
        request(`callback?state=${state}&code=PRIVATE_CODE`, {
          cookie: expired,
        }),
      )
    ).status,
  ).toBe(403);
  expect(mock.execute).not.toHaveBeenCalled();
});
it("callback sanitizes provider failures and clears the cookie without leaking code/token", async () => {
  mock.execute.mockResolvedValue(1);
  const connected = await connect(request());
  const auth = new URL((await connected.json()).authorizationUrl);
  const cookie = connected.headers.get("set-cookie")!.split(";")[0];
  transport.mockRejectedValue(new Error("PRIVATE_CODE TOKEN_SECRET"));
  const log = vi.spyOn(console, "error");
  const result = await callback(
    request(
      `callback?state=${auth.searchParams.get("state")}&code=PRIVATE_CODE`,
      { cookie },
    ),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).not.toMatch(/PRIVATE_CODE|TOKEN_SECRET/);
  expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(log).not.toHaveBeenCalled();
});
