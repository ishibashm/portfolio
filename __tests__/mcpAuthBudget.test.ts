// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createMcpAuthenticator } from "@/lib/mcpAuth";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";
import { createMcpPersonalHttp } from "@/lib/mcpPersonalHttp";

function setup() {
  const now = Date.UTC(2026, 9, 13);
  const userId = "11111111-1111-4111-8111-111111111111";
  const grantId = "22222222-2222-4222-8222-222222222222";
  const issuer = "https://cloud-palette.com/oauth";
  const token = {
    kind: "AccessToken",
    tokenType: "Bearer",
    accountId: userId,
    clientId: "client",
    grantId: "provider-grant",
    aud: MCP_PERSONAL_RESOURCE,
    scope: "read:profiles",
    iat: now / 1000 - 1,
    exp: now / 1000 + 599,
  };
  const protocol = {
    accountId: userId,
    clientId: "client",
    exp: now / 1000 + 600,
  };
  const row = {
    id: grantId,
    userId,
    clientId: "client",
    providerGrantId: "provider-grant",
    allowedProfileIds: ["selected"],
    createdAt: new Date(now - 1000),
    expiresAt: new Date(now + 60000),
    revokedAt: null,
  };
  const findToken = vi.fn().mockResolvedValue(token);
  const findGrant = vi.fn().mockResolvedValue(protocol);
  const findUnique = vi.fn().mockResolvedValue(row);
  const authenticate = createMcpAuthenticator({
    issuer,
    provider: {
      issuer,
      AccessToken: { find: findToken },
      Grant: { find: findGrant },
    },
    db: { mcpGrant: { findUnique } },
    now: () => now,
  } as unknown as Parameters<typeof createMcpAuthenticator>[0]);
  const controller = new AbortController();
  const remainingMs = vi.fn(() => 5000);
  return {
    authenticate,
    controller,
    remainingMs,
    findToken,
    findGrant,
    findUnique,
    values: [token, protocol, row],
    headers: new Headers({ authorization: `Bearer ${"a".repeat(43)}` }),
    budget: { signal: controller.signal, remainingMs },
  };
}

it.each([0, -1, NaN, Infinity, 5001])(
  "refuses invalid remaining budget %s before reading a token",
  async (remaining) => {
    const s = setup();
    s.remainingMs.mockReturnValue(remaining);
    await expect(s.authenticate(s.headers, s.budget)).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
    });
    expect(s.findToken).not.toHaveBeenCalled();
  },
);

it("refuses an already aborted request before I/O", async () => {
  const s = setup();
  s.controller.abort();
  await expect(s.authenticate(s.headers, s.budget)).rejects.toMatchObject({
    status: 503,
  });
  expect(s.findToken).not.toHaveBeenCalled();
});

it.each([0, 1, 2])(
  "stops after lookup %s completes following cancellation",
  async (index) => {
    const s = setup();
    const lookups = [s.findToken, s.findGrant, s.findUnique];
    let resolve!: (value: unknown) => void;
    lookups[index].mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const result = s.authenticate(s.headers, s.budget);
    await vi.waitFor(() => expect(lookups[index]).toHaveBeenCalledTimes(1));
    s.controller.abort();
    resolve(s.values[index]);
    await expect(result).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
    });
    for (const lookup of lookups.slice(index + 1))
      expect(lookup).not.toHaveBeenCalled();
  },
);

it("stops after deadline exhaustion even when no abort event has fired", async () => {
  const s = setup();
  s.findToken.mockImplementation(async () => {
    s.remainingMs.mockReturnValue(0);
    return s.values[0];
  });
  await expect(s.authenticate(s.headers, s.budget)).rejects.toMatchObject({
    status: 503,
  });
  expect(s.findGrant).not.toHaveBeenCalled();
});

it("preserves authenticated context when every lookup finishes within budget", async () => {
  const s = setup();
  const context = await s.authenticate(s.headers, s.budget);
  expect(context.allowedProfileIds).toEqual(["selected"]);
  expect(s.remainingMs).toHaveBeenCalledTimes(4);
});

it("HTTP forwards its original remaining budget and request cancellation to authentication", async () => {
  let tick = 0;
  const controller = new AbortController();
  const authenticate = vi.fn(async (_headers, budget) => {
    tick = 1200;
    expect(budget.remainingMs()).toBe(3800);
    expect(budget.signal.aborted).toBe(false);
    controller.abort();
    expect(budget.signal.aborted).toBe(true);
    throw new Error("test-only auth interruption");
  });
  const run = vi.fn(async () => {
    throw new Error("guard must not run");
  });
  const handle = createMcpPersonalHttp({
    authenticate,
    monotonicNow: () => tick,
    profileReader: () => async () => null,
    run,
    discovery: {
      unauthorizedResponse: () => new Response(null, { status: 401 }),
    },
  });
  const response = await handle(
    new Request("https://cloud-palette.com/api/mcp/personal", {
      method: "POST",
      signal: controller.signal,
    }),
  );
  expect(response.status).toBe(503);
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});
