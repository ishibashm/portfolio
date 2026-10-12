// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  throw new Error("HTTP must not import the site DB");
});
import { createMcpPersonalHttp } from "@/lib/mcpPersonalHttp";
import { createMcpPrivacyGuard } from "@/lib/mcpPrivacyGuard";
import { McpAuthError, createMcpAuthenticator } from "@/lib/mcpAuth";
import {
  createMcpDiscoveryContract,
  MCP_AUTHORIZATION_ISSUER,
} from "@/lib/mcpDiscovery";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";
import type { Provider } from "oidc-provider";
import type { PrismaClient } from "@prisma/client";
const user = "11111111-1111-4111-8111-111111111111";
const grant = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const clock = new Date("2026-10-12T00:00:00Z").getTime();
const token = "a".repeat(48);
const context = {
  userId: user,
  grantId: grant,
  clientId: "test",
  allowedProfileIds: ["one"],
};
const discovery = createMcpDiscoveryContract({
  issuer: MCP_AUTHORIZATION_ISSUER,
  authorization_endpoint: `${MCP_AUTHORIZATION_ISSUER}/auth`,
  token_endpoint: `${MCP_AUTHORIZATION_ISSUER}/token`,
  revocation_endpoint: `${MCP_AUTHORIZATION_ISSUER}/token/revocation`,
  scopes_supported: ["read:profiles"],
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
});
function setup() {
  const profileReader = vi.fn<
    (
      signal: AbortSignal,
      remainingMs: () => number,
    ) => (userId: string) => ReturnType<typeof findFirst>
  >(() => (userId: string) => findFirst({ where: { user_id: userId } }));
  const authenticate = vi.fn().mockResolvedValue(context);
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const rate = {
    reserve: vi.fn().mockResolvedValue({ allowed: true }),
    release: vi.fn().mockResolvedValue(undefined),
  };
  let time = 0;
  const monotonicNow = () => time;
  const run = createMcpPrivacyGuard({ audit, rate, monotonicNow });
  return {
    authenticate,
    profileReader,
    audit,
    rate,
    run,
    monotonicNow,
    advance: (ms: number) => {
      time += ms;
    },
    handle: createMcpPersonalHttp({
      authenticate,
      profileReader,
      run,
      discovery,
      monotonicNow,
    }),
  };
}
function request(
  method = "ping",
  params?: unknown,
  options: {
    headers?: Record<string, string>;
    body?: string;
    httpMethod?: string;
    signal?: AbortSignal;
  } = {},
) {
  const httpMethod = options.httpMethod ?? "POST";
  return new Request(MCP_PERSONAL_RESOURCE, {
    method: httpMethod,
    signal: options.signal,
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
    ...(!["GET", "HEAD"].includes(httpMethod)
      ? {
          body:
            options.body ??
            JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }
      : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    presets: [],
    metaphysical_config: {},
    updated_at: new Date(clock),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("personal HTTP composition, not mounted", () => {
  it("passes the remaining HTTP budget and abort signal to the reader without loading the site DB", async () => {
    const s = setup();
    s.authenticate.mockImplementation(async () => {
      s.advance(1200);
      return context;
    });
    await s.handle(
      request("tools/call", { name: "list_profiles", arguments: {} }),
    );
    const [signal, remainingMs] = s.profileReader.mock.calls[0];
    expect(signal.aborted).toBe(false);
    expect(remainingMs()).toBe(3800);
    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { user_id: user },
    });
  });
  it("refuses HTTP composition without an explicit reader", () => {
    const s = setup();
    expect(() =>
      createMcpPersonalHttp({ ...s, discovery, profileReader: undefined! }),
    ).toThrow("MCP_PROFILE_READER_REQUIRED");
  });
  it.each([
    [
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    ],
    ["tools/list", undefined],
    ["tools/call", { name: "list_profiles", arguments: {} }],
    ["ping", undefined],
    ["notifications/initialized", undefined],
  ])("authenticates and accounts once for %s", async (method, params) => {
    const s = setup();
    const req = request(method, params, {
      headers: { cookie: "private-cookie" },
      ...(method === "notifications/initialized"
        ? { body: JSON.stringify({ jsonrpc: "2.0", method }) }
        : {}),
    });
    const res = await s.handle(req);
    expect(res.status).toBe(method === "notifications/initialized" ? 202 : 200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(s.authenticate).toHaveBeenCalledTimes(1);
    expect([...s.authenticate.mock.calls[0][0].keys()]).toEqual([
      "authorization",
    ]);
    expect(s.rate.reserve).toHaveBeenCalledTimes(1);
    expect(s.audit.record).toHaveBeenCalledTimes(1);
    expect(s.audit.record.mock.calls[0][0].result).toBe("success");
  });
  it.each([
    ["UNAUTHORIZED", 401],
    ["INSUFFICIENT_SCOPE", 403],
    ["TEMPORARILY_UNAVAILABLE", 503],
  ] as const)(
    "maps %s before any body, DB, or tool execution",
    async (code, status) => {
      const s = setup();
      s.authenticate.mockRejectedValue(new McpAuthError(code));
      const res = await s.handle(
        request(
          "tools/call",
          { name: "list_profiles" },
          { headers: { host: "evil.test", "x-forwarded-host": "evil.test" } },
        ),
      );
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      if (status !== 503) {
        expect(res.headers.get("www-authenticate")).toContain(
          'resource_metadata="https://cloud-palette.com/',
        );
        expect(res.headers.get("www-authenticate")).not.toContain("evil.test");
      }
      expect(s.rate.reserve).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it("rejects methods and untrusted Origins while allowing absent or listed Origins", async () => {
    const s = setup();
    for (const httpMethod of [
      "GET",
      "HEAD",
      "DELETE",
      "PUT",
      "PATCH",
      "OPTIONS",
    ]) {
      const res = await s.handle(request("ping", undefined, { httpMethod }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
    for (const origin of [
      "null",
      "https://evil.test",
      "https://cloud-palette.com.evil.test",
      "https://cloud-palette.com/",
    ]) {
      expect(
        (await s.handle(request("ping", undefined, { headers: { origin } })))
          .status,
      ).toBe(403);
    }
    expect(s.authenticate).not.toHaveBeenCalled();
    expect((await s.handle(request("ping"))).status).toBe(200);
    expect(
      (
        await s.handle(
          request("ping", undefined, {
            headers: { origin: "https://cloud-palette.com" },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it.each([
    ["[]", "invalid_request", 400],
    ["private-invalid-json", "invalid_request", 400],
    [
      JSON.stringify({
        jsonrpc: "2.0",
        id: "private-id",
        method: "private-method",
      }),
      "unknown_method",
      400,
    ],
    [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "private-tool" },
      }),
      "unknown_tool",
      400,
    ],
    ["x".repeat(32769), "invalid_request", 413],
  ])("accounts and redacts rejected bodies", async (body, event, status) => {
    const s = setup();
    const res = await s.handle(request("ping", undefined, { body }));
    expect(res.status).toBe(status);
    expect(await res.text()).not.toContain("private-");
    expect(s.rate.reserve).toHaveBeenCalledTimes(1);
    expect(s.audit.record.mock.calls[0][0]).toMatchObject({
      event,
      result: "invalid",
    });
    expect(JSON.stringify(s.audit.record.mock.calls)).not.toContain("private-");
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("maps shared rate denial to 429/Retry-After and audit failure to 503 before publishing", async () => {
    const s = setup();
    s.rate.reserve.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 3,
    });
    const limited = await s.handle(request("ping"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3");
    s.audit.record.mockRejectedValue(new Error("private-db-error"));
    const failed = await s.handle(request("tools/list"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("tools");
  });
  it("releases exactly one time lease and only returns calculation inputs when explicitly requested", async () => {
    const s = setup();
    findFirst.mockResolvedValue({
      presets: [
        {
          id: "one",
          name: "saved",
          birthDate: "1990-05-15",
          baseLat: 35,
          baseLon: 139,
        },
      ],
      metaphysical_config: {},
      updated_at: new Date(clock),
    });
    const time = await s.handle(
      request("tools/call", {
        name: "judge_time_slots",
        arguments: { profile: { id: "one" }, date: "2026-10-12" },
      }),
    );
    expect(time.status).toBe(200);
    expect(await time.text()).not.toContain("1990-05-15");
    expect(s.rate.reserve.mock.calls[0][0].timeCalculation).toBe(true);
    expect(s.rate.release).toHaveBeenCalledTimes(1);
    expect(s.rate.reserve).toHaveBeenCalledTimes(1);
    const minimal = await s.handle(
      request("tools/call", {
        name: "get_profile",
        arguments: { profile: { id: "one" } },
      }),
    );
    expect(await minimal.text()).not.toContain("1990-05-15");
    const explicit = await s.handle(
      request("tools/call", {
        name: "get_profile",
        arguments: { profile: { id: "one" }, includeCalculationInputs: true },
      }),
    );
    expect(await explicit.text()).toContain("1990-05-15");
    expect(JSON.stringify(s.audit.record.mock.calls)).not.toContain(
      "1990-05-15",
    );
  });

  it("accepts the exact byte limit, rejects compressed bodies, and never logs raw dependency errors", async () => {
    const s = setup();
    const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(
      (await s.handle(request("ping", undefined, { body: ping.padEnd(32768) })))
        .status,
    ).toBe(200);
    expect(
      (
        await s.handle(
          request("ping", undefined, {
            headers: { "content-encoding": "gzip" },
          }),
        )
      ).status,
    ).toBe(400);
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    s.authenticate.mockRejectedValue(
      new Error("private-birth private-token\nforged-log"),
    );
    const res = await s.handle(request());
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      JSON.stringify({ error: "TEMPORARILY_UNAVAILABLE" }),
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("uses one five-second budget across authentication, body, execution and audit", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.authenticate.mockImplementation(async () => {
      s.advance(4500);
      return context;
    });
    s.audit.record.mockImplementation(() => new Promise(() => {}));
    const pending = s.handle(request("ping"));
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).status).toBe(503);
    expect(s.rate.reserve).toHaveBeenCalledTimes(1);
    const slow = setup();
    slow.authenticate.mockReturnValue(new Promise(() => {}));
    const waiting = slow.handle(request("ping"));
    await vi.advanceTimersByTimeAsync(5000);
    expect((await waiting).status).toBe(503);
    expect(slow.rate.reserve).not.toHaveBeenCalled();
  });
  it("cancels stalled body reading and refuses late authentication without further work", async () => {
    vi.useFakeTimers();
    const s = setup();
    const cancel = vi.fn();
    const waiting = s.handle(
      new Request(MCP_PERSONAL_RESOURCE, {
        method: "POST",
        body: new ReadableStream({ cancel }),
        duplex: "half",
      } as RequestInit),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect((await waiting).status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
    const late = setup();
    let resolve!: (value: typeof context) => void;
    late.authenticate.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const second = late.handle(request());
    await vi.advanceTimersByTimeAsync(5000);
    expect((await second).status).toBe(503);
    resolve(context);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.rate.reserve).not.toHaveBeenCalled();
  });
  it("separates concurrent identities and observes revocation on the next request using the real authenticator", async () => {
    const s = setup();
    let revoked = false;
    const provider = {
      issuer: MCP_AUTHORIZATION_ISSUER,
      AccessToken: {
        find: vi.fn(async (value: string) => ({
          kind: "AccessToken",
          tokenType: "Bearer",
          accountId: value === token ? user : other,
          clientId: "test",
          grantId: value,
          aud: MCP_PERSONAL_RESOURCE,
          scope: "read:profiles",
          iat: clock / 1000,
          exp: clock / 1000 + 600,
        })),
      },
      Grant: {
        find: vi.fn(async (value: string) => ({
          accountId: value === token ? user : other,
          clientId: "test",
          exp: clock / 1000 + 3600,
        })),
      },
    };
    const db = {
      mcpGrant: {
        findUnique: vi.fn(
          async ({ where }: { where: { providerGrantId: string } }) => ({
            id: grant,
            userId: where.providerGrantId === token ? user : other,
            clientId: "test",
            providerGrantId: where.providerGrantId,
            allowedProfileIds: ["one"],
            createdAt: new Date(clock),
            expiresAt: new Date(clock + 3600_000),
            revokedAt: revoked ? new Date(clock) : null,
          }),
        ),
      },
    };
    const authenticate = createMcpAuthenticator({
      issuer: MCP_AUTHORIZATION_ISSUER,
      provider: provider as unknown as Provider,
      db: db as unknown as PrismaClient,
      now: () => clock,
    });
    const handle = createMcpPersonalHttp({ ...s, authenticate, discovery });
    findFirst.mockImplementation(
      async ({ where }: { where: { user_id: string } }) => ({
        presets: [
          {
            id: "one",
            name: where.user_id,
            birthDate: "1990-05-15",
            baseLat: 35,
            baseLon: 139,
          },
        ],
        metaphysical_config: {},
        updated_at: new Date(clock),
      }),
    );
    const responses = await Promise.all([
      handle(request("tools/call", { name: "list_profiles", arguments: {} })),
      handle(
        request(
          "tools/call",
          { name: "list_profiles", arguments: {} },
          { headers: { authorization: `Bearer ${"b".repeat(48)}` } },
        ),
      ),
    ]);
    const first = await responses[0].text();
    const second = await responses[1].text();
    expect(first).toContain(user);
    expect(first).not.toContain(other);
    expect(second).toContain(other);
    expect(second).not.toContain(user);
    revoked = true;
    const refused = await handle(
      request("tools/call", { name: "list_profiles", arguments: {} }),
    );
    expect(refused.status).toBe(401);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(provider.AccessToken.find).toHaveBeenCalledTimes(3);
  });
});
