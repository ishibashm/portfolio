// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpAuthenticator, McpAuthError } from "@/lib/mcpAuth";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";

// Importing either legacy auth or the real DB would introduce an unintended path.
vi.mock("@/lib/prisma", () => {
  throw new Error("real DB forbidden");
});
vi.mock("@/lib/userConfig", () => {
  throw new Error("cookie auth forbidden");
});
const now = Date.UTC(2026, 9, 11);
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const rawToken = "a".repeat(43);
const issuer = "https://cloud-palette.com/oauth";
const token = () => ({
  kind: "AccessToken",
  tokenType: "Bearer",
  accountId: userId,
  clientId: "client",
  grantId: "protocol-grant",
  aud: MCP_PERSONAL_RESOURCE,
  scope: "read:profiles",
  iat: now / 1000 - 1,
  exp: now / 1000 + 599,
});
const row = () => ({
  id: grantId,
  userId,
  clientId: "client",
  providerGrantId: "protocol-grant",
  allowedProfileIds: ["chosen"],
  createdAt: new Date(now - 1000),
  expiresAt: new Date(now + 1000),
  revokedAt: null,
});
const findToken = vi.fn();
const findGrant = vi.fn();
const findUnique = vi.fn();
function setup(overrides: Record<string, unknown> = {}) {
  // Structural doubles exercise runtime validation; production takes actual provider/Prisma types.
  return createMcpAuthenticator({
    issuer,
    provider: {
      issuer,
      AccessToken: { find: findToken },
      Grant: { find: findGrant },
    },
    db: { mcpGrant: { findUnique } },
    now: () => now,
    ...overrides,
  } as unknown as Parameters<typeof createMcpAuthenticator>[0]);
}
const headers = (authorization = `Bearer ${rawToken}`) =>
  new Headers({ authorization, cookie: "dev-bypass-id=admin" });
beforeEach(() => {
  vi.clearAllMocks();
  findToken.mockResolvedValue(token());
  findGrant.mockResolvedValue({
    accountId: userId,
    clientId: "client",
    exp: now / 1000 + 1000,
  });
  findUnique.mockResolvedValue(row());
});

describe("personal MCP authentication", () => {
  it("projects only selected IDs and resolves opaque tokens locally", async () => {
    const result = await setup()(headers());
    expect(result).toEqual({
      userId,
      grantId,
      clientId: "client",
      allowedProfileIds: ["chosen"],
    });
    expect(Object.isFrozen(result.allowedProfileIds)).toBe(true);
    expect(findToken).toHaveBeenCalledExactlyOnceWith(rawToken);
    expect(findGrant).toHaveBeenCalledExactlyOnceWith("protocol-grant");
    expect(findUnique.mock.calls[0][0]).toEqual({
      where: { providerGrantId: "protocol-grant" },
      select: {
        id: true,
        userId: true,
        clientId: true,
        providerGrantId: true,
        allowedProfileIds: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  });
  it.each([
    "",
    "Basic abc",
    `Bearer ${rawToken}, Bearer ${rawToken}`,
    "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.",
    "Bearer short",
    `Bearer ${"x".repeat(513)}`,
    `Bearer  ${rawToken}`,
  ])("rejects invalid authorization before lookup: %s", async (value) => {
    await expect(setup()(headers(value))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(findToken).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("does not accept cookies or development auth without Bearer", async () => {
    await expect(
      setup()(new Headers({ cookie: "session=valid; dev-bypass-id=admin" })),
    ).rejects.toMatchObject({ status: 401 });
    expect(findToken).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { ...token(), accountId: "dev-bypass-id" },
    { ...token(), aud: "https://elsewhere.example/api/mcp/personal" },
    { ...token(), aud: [MCP_PERSONAL_RESOURCE, "another"] },
    { ...token(), exp: now / 1000 },
    { ...token(), iat: now / 1000 + 1 },
    { ...token(), exp: now / 1000 + 600 },
    { ...token(), kind: "RefreshToken" },
    { ...token(), tokenType: "DPoP" },
    { ...token(), jkt: "proof-key" },
  ])("rejects untrusted/expired/wrong-resource token %#", async (value) => {
    findToken.mockResolvedValue(value);
    await expect(setup()(headers())).rejects.toMatchObject({ status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("reports missing exact scope as 403", async () => {
    findToken.mockResolvedValue({ ...token(), scope: "read:profiles:all" });
    await expect(setup()(headers())).rejects.toMatchObject({
      code: "INSUFFICIENT_SCOPE",
      status: 403,
    });
    expect(findGrant).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { accountId: otherId, clientId: "client", exp: now / 1000 + 100 },
    { accountId: userId, clientId: "other", exp: now / 1000 + 100 },
    { accountId: userId, clientId: "client", exp: now / 1000 },
  ])("rejects revoked/mismatched protocol grant %#", async (value) => {
    findGrant.mockResolvedValue(value);
    await expect(setup()(headers())).rejects.toMatchObject({ status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...row(), userId: otherId },
    { ...row(), clientId: "other" },
    { ...row(), providerGrantId: "other" },
    { ...row(), revokedAt: new Date(now) },
    { ...row(), expiresAt: new Date(now) },
    { ...row(), createdAt: new Date(now + 1) },
    { ...row(), expiresAt: new Date(now + 30 * 86400_000) },
    { ...row(), allowedProfileIds: [] },
    { ...row(), allowedProfileIds: ["chosen", "chosen"] },
    {
      ...row(),
      allowedProfileIds: Array.from({ length: 101 }, (_, i) => String(i)),
    },
  ])("rejects missing/revoked/invalid application grant %#", async (value) => {
    findUnique.mockResolvedValue(value);
    await expect(setup()(headers())).rejects.toMatchObject({ status: 401 });
  });
  it("reloads permissions and revocation on every request", async () => {
    const authenticate = setup();
    expect((await authenticate(headers())).allowedProfileIds).toEqual([
      "chosen",
    ]);
    findUnique.mockResolvedValue({ ...row(), allowedProfileIds: ["reduced"] });
    expect((await authenticate(headers())).allowedProfileIds).toEqual([
      "reduced",
    ]);
    findUnique.mockResolvedValue({ ...row(), revokedAt: new Date(now) });
    await expect(authenticate(headers())).rejects.toMatchObject({
      status: 401,
    });
    expect(findUnique).toHaveBeenCalledTimes(3);
  });
  it.each([findToken, findGrant, findUnique])(
    "fails closed without logging or retaining backend errors %#",
    async (lookup) => {
      const spies = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "error"),
      ];
      lookup.mockRejectedValue(
        new Error(`private birth/coords/token ${rawToken}`),
      );
      try {
        const error = await setup()(headers()).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(McpAuthError);
        expect(error).toMatchObject({
          message: "TEMPORARILY_UNAVAILABLE",
          status: 503,
        });
        expect(error).not.toHaveProperty("cause");
        expect(JSON.stringify(error)).not.toContain(rawToken);
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    },
  );
  it("rejects an untrusted or malformed configured issuer", () => {
    for (const value of [
      "https://other.example/oauth",
      "http://cloud-palette.com/oauth",
      "not a URL",
      `${issuer}?foo=bar`,
      "https://user:pass@cloud-palette.com/oauth",
    ])
      expect(() => setup({ issuer: value })).toThrow("TEMPORARILY_UNAVAILABLE");
    expect(findToken).not.toHaveBeenCalled();
  });
  it("rejects expiry reached while waiting for storage", async () => {
    const clock = vi
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValue(now + 1000);
    await expect(setup({ now: clock })(headers())).rejects.toMatchObject({
      status: 401,
    });
  });
  it("keeps concurrent users separate", async () => {
    const second = "b".repeat(43);
    findToken.mockImplementation(async (value) => ({
      ...token(),
      accountId: value === second ? otherId : userId,
      grantId: value === second ? "second" : "protocol-grant",
    }));
    findGrant.mockImplementation(async (id) => ({
      accountId: id === "second" ? otherId : userId,
      clientId: "client",
      exp: now / 1000 + 100,
    }));
    findUnique.mockImplementation(async ({ where }) => ({
      ...row(),
      userId: where.providerGrantId === "second" ? otherId : userId,
      providerGrantId: where.providerGrantId,
      allowedProfileIds: [where.providerGrantId],
    }));
    const authenticate = setup();
    const results = await Promise.all([
      authenticate(headers()),
      authenticate(headers(`Bearer ${second}`)),
    ]);
    expect(results.map((r) => r.userId)).toEqual([userId, otherId]);
    expect(results.map((r) => r.allowedProfileIds)).toEqual([
      ["protocol-grant"],
      ["second"],
    ]);
  });
});

// The AS requires Node 22. Run this file with that runtime as well as site Node 20.
it.skipIf(Number(process.versions.node.split(".")[0]) < 22)(
  "resolves real provider opaque access tokens and observes protocol revocation",
  async () => {
    const { Provider } = await import("oidc-provider");
    const { generateKeyPairSync, randomBytes } = await import("node:crypto");
    const { createMcpAuthorizationPolicy } =
      await import("@/lib/mcpAuthorizationConfig");
    const records = new Map<string, unknown>();
    class MemoryAdapter {
      constructor(private model: string) {}
      async upsert(id: string, payload: unknown) {
        records.set(`${this.model}:${id}`, payload);
      }
      async find(id: string) {
        return records.get(`${this.model}:${id}`);
      }
      async destroy(id: string) {
        records.delete(`${this.model}:${id}`);
      }
    }
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const provider = new Provider(issuer, {
      ...(await createMcpAuthorizationPolicy()),
      // Deliberately test-only; production requires encrypted, persistent storage.
      adapter: MemoryAdapter as unknown as NonNullable<
        import("oidc-provider").Configuration["adapter"]
      >,
      jwks: {
        keys: [
          {
            ...privateKey.export({ format: "jwk" }),
            kid: "test",
            use: "sig",
            alg: "RS256",
          },
        ],
      },
      cookies: { keys: [randomBytes(32).toString("hex")] },
      clients: [
        {
          client_id: "client",
          redirect_uris: ["https://client.invalid/callback"],
          response_types: ["code"],
          grant_types: ["authorization_code", "refresh_token"],
          token_endpoint_auth_method: "none",
        },
      ],
    });
    const grant = new provider.Grant({ accountId: userId, clientId: "client" });
    const protocolId = await grant.save();
    const client = await provider.Client.find("client");
    const access = new provider.AccessToken({
      accountId: userId,
      client: client!,
      grantId: protocolId,
      gty: "authorization_code",
      aud: MCP_PERSONAL_RESOURCE,
      scope: "read:profiles",
      expiresIn: 600,
    });
    const opaque = await access.save();
    const live = Date.now();
    findUnique.mockResolvedValue({
      ...row(),
      providerGrantId: protocolId,
      createdAt: new Date(live - 1000),
      expiresAt: new Date(live + 60000),
    });
    const authenticate = setup({ provider, now: Date.now });
    expect((await authenticate(headers(`Bearer ${opaque}`))).userId).toBe(
      userId,
    );
    await grant.destroy();
    await expect(
      authenticate(headers(`Bearer ${opaque}`)),
    ).rejects.toMatchObject({ status: 401 });
  },
);
