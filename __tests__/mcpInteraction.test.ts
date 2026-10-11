// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createServer,
  request,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { Provider } from "oidc-provider";
import {
  createMcpInteractionHandler,
  mcpInteractionPolicy,
} from "@/lib/mcpInteraction";
import { createMcpSiteLoginVerifier } from "@/lib/mcpSiteLogin";
import {
  createMcpAuthorizationPolicy,
  MCP_PERSONAL_RESOURCE,
} from "@/lib/mcpAuthorizationConfig";
import { MCP_AUTHORIZATION_ISSUER } from "@/lib/mcpDiscovery";

import { createMcpProviderStore } from "@/lib/mcpProviderStore";
import { createMcpProviderAdapter } from "@/lib/mcpProviderAdapter";
import { createMcpStateCrypto } from "@/lib/mcpStateCrypto";
import { createMcpAuthenticator } from "@/lib/mcpAuth";
import { mcpPersistence } from "./helpers/mcpPersistence";

const { getUser, createClient } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/ssr", async (original) => ({
  ...(await original<typeof import("@supabase/ssr")>()),
  createServerClient: createClient,
}));
const userId = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("Node Supabase login boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReturnValue({ auth: { getUser } });
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  });
  const verify = createMcpSiteLoginVerifier({
    supabaseUrl: "https://test.supabase.invalid",
    publicKey: "dummy-public-key",
  });
  const req = {
    headers: {
      cookie: "dev_bypass_user=attacker; sb-test-auth-token=dummy-cookie",
    },
  } as IncomingMessage;
  it("calls remote getUser with site cookies, ignores bypass, preserves provider cookies", async () => {
    const headers = new Map<string, unknown>([
      ["Set-Cookie", ["_interaction=dummy-provider-cookie"]],
    ]);
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => headers.set(name, value),
    } as unknown as ServerResponse;
    expect(await verify(req, res)).toBe(userId);
    expect(getUser).toHaveBeenCalledExactlyOnceWith();
    const options = createClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toContainEqual({
      name: "sb-test-auth-token",
      value: "dummy-cookie",
    });
    options.cookies.setAll([
      {
        name: "sb-test-auth-token",
        value: "rotated-dummy",
        options: { path: "/" },
      },
    ]);
    expect(headers.get("Set-Cookie")).toEqual([
      "_interaction=dummy-provider-cookie",
      expect.stringMatching(
        /sb-test-auth-token=rotated-dummy; Path=\/; Secure; SameSite=Lax/,
      ),
    ]);
  });
  it.each([null, "dev-bypass-id", "email@example.invalid"])(
    "rejects invalid subject %s",
    async (id) => {
      getUser.mockResolvedValue({
        data: { user: id ? { id } : null },
        error: null,
      });
      expect(await verify(req, {} as ServerResponse)).toBeNull();
    },
  );
  it("does not trust user data returned alongside an auth error", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: new Error("private"),
    });
    expect(await verify(req, {} as ServerResponse)).toBeNull();
  });
  it("sanitizes thrown auth errors", async () => {
    getUser.mockRejectedValue(new Error("private-token"));
    await expect(verify(req, {} as ServerResponse)).rejects.toThrow(
      "TEMPORARILY_UNAVAILABLE",
    );
  });
});

describe.skipIf(Number(process.versions.node.split(".")[0]) < 22)(
  "real provider browser interaction (loopback only)",
  () => {
    let provider: Provider;
    let server: ReturnType<typeof createServer>;
    let port: number;
    const findFirst = vi.fn();
    const persistence = mcpPersistence();
    const { create, updateMany } = persistence.app;
    const crypto = createMcpStateCrypto({
      lookupKey: randomBytes(32),
      activeVersion: "test",
      encryptionKeys: new Map([["test", randomBytes(32)]]),
    });
    const store = createMcpProviderStore({
      db: persistence.db,
      grantKeyHash: (id) => crypto.digest("Grant", "id", id),
    });
    const verifySiteUser = vi.fn();
    const claimInteraction =
      vi.fn<(uid: string, expiresAt: Date) => Promise<boolean>>();
    let authenticate: ReturnType<typeof createMcpAuthenticator>;
    type Jar = Map<string, string>;
    async function http(
      path: string,
      jar: Jar,
      options: {
        method?: string;
        body?: string;
        headers?: Record<string, string | undefined>;
      } = {},
    ) {
      // All sockets go to loopback; canonical Host simulates the TLS proxy.
      const url = new URL(path, MCP_AUTHORIZATION_ISSUER);
      if (url.origin !== "https://cloud-palette.com")
        throw new Error("external request forbidden");
      return new Promise<{
        status: number;
        headers: import("node:http").IncomingHttpHeaders;
        body: string;
      }>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port,
            path: url.pathname + url.search,
            method: options.method ?? "GET",
            headers: {
              host: "cloud-palette.com",
              "x-forwarded-proto": "https",
              cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
              ...(options.body === undefined
                ? {}
                : {
                    ...(url.pathname.startsWith("/oauth/interaction/")
                      ? { origin: "https://cloud-palette.com" }
                      : {}),
                    "content-type": "application/x-www-form-urlencoded",
                    "content-length": Buffer.byteLength(options.body),
                  }),
              ...options.headers,
            },
          },
          (res) => {
            for (const cookie of res.headers["set-cookie"] ?? []) {
              const pair = cookie.split(";", 1)[0];
              const at = pair.indexOf("=");
              jar.set(pair.slice(0, at), pair.slice(at + 1));
            }
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () =>
              resolve({
                status: res.statusCode!,
                headers: res.headers,
                body: Buffer.concat(chunks).toString(),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(options.body);
      });
    }
    async function start(jar: Jar = new Map()) {
      const query = new URLSearchParams({
        client_id: "test-client",
        redirect_uri: "https://client.invalid/callback",
        response_type: "code",
        scope: "read:profiles",
        resource: MCP_PERSONAL_RESOURCE,
        code_challenge: createHash("sha256")
          .update("v".repeat(43))
          .digest("base64url"),
        code_challenge_method: "S256",
        state: "opaque-client-state",
      });
      const auth = await http(`/oauth/auth?${query}`, jar);
      expect(auth.status).toBe(303);
      const path = auth.headers.location!;
      const page = await http(path, jar);
      expect(page.status).toBe(200);
      const ticket = page.body.match(/name="ticket" value="([^"]+)"/)![1];
      return { jar, path, ticket, page };
    }
    function form(ticket: string, decision = "allow", ids = ["one"]) {
      const body = new URLSearchParams({ ticket, decision });
      for (const id of ids) body.append("profileIds", id);
      return body.toString();
    }
    beforeAll(async () => {
      const { Provider } = await import("oidc-provider");
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const adapter = await createMcpProviderAdapter({ crypto, store });
      claimInteraction.mockImplementation(adapter.claimInteraction);
      provider = new Provider(MCP_AUTHORIZATION_ISSUER, {
        ...(await createMcpAuthorizationPolicy()),
        ...mcpInteractionPolicy,
        adapter: adapter.adapter,
        jwks: {
          keys: [
            {
              ...privateKey.export({ format: "jwk" }),
              kid: "ephemeral-test",
              use: "sig",
              alg: "RS256",
            },
          ],
        },
        cookies: { keys: [randomBytes(32).toString("hex")] },
        clients: [
          {
            client_id: "test-client",
            client_name: "Test AI",
            redirect_uris: ["https://client.invalid/callback"],
            response_types: ["code"],
            grant_types: ["authorization_code", "refresh_token"],
            token_endpoint_auth_method: "none",
          },
        ],
      });
      provider.proxy = true;
      authenticate = createMcpAuthenticator({
        issuer: MCP_AUTHORIZATION_ISSUER,
        provider,
        db: persistence.db,
      });
      const handler = createMcpInteractionHandler({
        provider,
        db: {
          user_configs: { findFirst },
          mcpGrant: { create, updateMany },
        } as unknown as PrismaClient,
        signingKey: randomBytes(32),
        verifySiteUser,
        claimInteraction,
      });
      const callback = provider.callback();
      server = createServer((req, res) => {
        if (req.url?.startsWith("/oauth/interaction/")) {
          void handler(req, res);
          return;
        }
        Object.assign(req, { originalUrl: req.url });
        req.url = req.url?.slice("/oauth".length);
        void callback(req, res);
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      port = (server.address() as AddressInfo).port;
    });
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    beforeEach(() => {
      vi.clearAllMocks();
      persistence.rows.clear();
      persistence.grants.clear();
      findFirst.mockResolvedValue({
        presets: [
          { id: "one", name: "A", birthDate: "1990-01-01" },
          { id: "two", name: "B" },
        ],
      });
      verifySiteUser.mockResolvedValue(userId);
    });
    it("connects authorization, consent, selection and callback using real signed interaction cookies", async () => {
      const { jar, path, ticket, page } = await start();
      expect(page.headers["cache-control"]).toBe("private, no-store");
      expect(page.body).not.toContain("1990-01-01");
      expect(page.body).not.toContain("checked");
      const accepted = await http(path, jar, {
        method: "POST",
        body: form(ticket, "allow", ["two"]),
      });
      expect(accepted.status).toBe(303);
      expect(create).toHaveBeenCalledOnce();
      const data = create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        userId,
        clientId: "test-client",
        allowedProfileIds: ["two"],
        revokedAt: null,
      });
      expect(
        data.expiresAt.getTime() - data.createdAt.getTime(),
      ).toBeLessThanOrEqual(30 * 86400_000);
      const grant = await provider.Grant.find(data.providerGrantId);
      expect(grant?.getResourceScope(MCP_PERSONAL_RESOURCE)).toBe(
        "read:profiles",
      );
      const resumed = await http(accepted.headers.location!, jar);
      expect(resumed.status).toBe(303);
      const callback = new URL(resumed.headers.location!);
      expect(callback.origin + callback.pathname).toBe(
        "https://client.invalid/callback",
      );
      expect(callback.searchParams.get("state")).toBe("opaque-client-state");
      expect(callback.searchParams.get("code")).toBeTruthy();
      // The same client/session must still select profiles for a new connection.
      const again = await start(jar);
      expect(again.page.body).not.toContain("checked");
      expect(again.path).not.toBe(path);
      // Never request the external callback URL.
      expect(
        (await http(path, jar, { method: "POST", body: form(ticket) })).status,
      ).toBe(400);
      expect(create).toHaveBeenCalledOnce();
    });
    async function authorize() {
      const { jar, path, ticket } = await start();
      const accepted = await http(path, jar, {
        method: "POST",
        body: form(ticket, "allow", ["two"]),
      });
      expect(accepted.status).toBe(303);
      const resumed = await http(accepted.headers.location!, jar);
      const code = new URL(resumed.headers.location!).searchParams.get("code")!;
      expect(code).toBeTruthy();
      return { jar, code, grant: create.mock.calls.at(-1)![0].data };
    }
    async function exchange(jar: Jar, params: Record<string, string>) {
      return http("/oauth/token", jar, {
        method: "POST",
        body: new URLSearchParams({
          client_id: "test-client",
          resource: MCP_PERSONAL_RESOURCE,
          ...params,
        }).toString(),
      });
    }
    function codeParams(code: string) {
      return {
        grant_type: "authorization_code",
        code,
        code_verifier: "v".repeat(43),
        redirect_uri: "https://client.invalid/callback",
      };
    }
    it("connects selection, encrypted persistence, code exchange, RS authentication, refresh and replay revocation", async () => {
      const { jar, code, grant } = await authorize();
      const response = await exchange(jar, codeParams(code));
      expect(response.status, response.body).toBe(200);
      const tokens = JSON.parse(response.body);
      const headers = (token: string) =>
        new Headers({ authorization: `Bearer ${token}` });
      expect(await authenticate(headers(tokens.access_token))).toMatchObject({
        userId,
        grantId: grant.id,
        allowedProfileIds: ["two"],
      });
      const refreshed = await exchange(jar, {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });
      expect(refreshed.status).toBe(200);
      const rotated = JSON.parse(refreshed.body);
      expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
      expect(await authenticate(headers(rotated.access_token))).toHaveProperty(
        "allowedProfileIds",
        ["two"],
      );
      const stored = JSON.stringify([...persistence.rows.values()]);
      for (const secret of [
        code,
        tokens.access_token,
        tokens.refresh_token,
        "1990-01-01",
      ])
        expect(stored).not.toContain(secret);
      expect(
        (
          await exchange(jar, {
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token,
          })
        ).status,
      ).toBe(400);
      expect(persistence.grants.get(grant.id)?.revokedAt).toBeInstanceOf(Date);
      await expect(authenticate(headers(rotated.access_token))).rejects.toThrow(
        "UNAUTHORIZED",
      );
    });
    it.each(["missing", "revoked", "expired"])(
      "refuses token exchange when application consent becomes %s",
      async (condition) => {
        const { jar, code, grant } = await authorize();
        if (condition === "missing") persistence.grants.delete(grant.id);
        else
          persistence.grants.set(grant.id, {
            ...grant,
            ...(condition === "revoked"
              ? { revokedAt: new Date() }
              : { expiresAt: new Date(0) }),
          });
        const response = await exchange(jar, codeParams(code));
        expect(response.status).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty(
          "error",
          "invalid_grant",
        );
        expect(JSON.parse(response.body)).not.toHaveProperty("access_token");
        expect(
          [...persistence.rows.values()].filter(
            (row) => row.model === "AccessToken",
          ),
        ).toHaveLength(0);
      },
    );
    it("refusal returns access_denied without creating any grant", async () => {
      const { jar, path, ticket } = await start();
      const denied = await http(path, jar, {
        method: "POST",
        body: form(ticket, "deny", []),
      });
      expect(denied.status).toBe(303);
      const resumed = await http(denied.headers.location!, jar);
      expect(new URL(resumed.headers.location!).searchParams.get("error")).toBe(
        "access_denied",
      );
      expect(create).not.toHaveBeenCalled();
    });
    it("requires interaction cookie, matching path, same origin and canonical Host", async () => {
      const { jar, path, ticket } = await start();
      for (const options of [
        { headers: { origin: "https://evil.invalid" } },
        { headers: { origin: "" } },
        { headers: { "sec-fetch-site": "cross-site" } },
        { headers: { host: "evil.invalid" } },
        { headers: { "x-forwarded-host": "evil.invalid" } },
        { headers: { "x-forwarded-proto": "http" } },
      ])
        expect(
          (
            await http(path, jar, {
              method: "POST",
              body: form(ticket),
              ...options,
            })
          ).status,
        ).toBe(400);
      expect((await http(path, new Map())).status).toBe(400);
      const forgedCookie = new Map(jar);
      for (const name of forgedCookie.keys())
        if (name.endsWith(".sig")) forgedCookie.set(name, "forged");
      expect((await http(path, forgedCookie)).status).toBe(400);
      expect(
        (await http(`/oauth/interaction/${"x".repeat(32)}`, jar)).status,
      ).toBe(400);
      expect((await http(path, jar, { method: "DELETE" })).status).toBe(405);
      expect(create).not.toHaveBeenCalled();
    });
    it("uses the existing login with a server-generated next path; POST requires reauthentication", async () => {
      const { jar, path, ticket } = await start();
      verifySiteUser.mockResolvedValue(null);
      const response = await http(path, jar);
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe(
        `/login?next=${encodeURIComponent(new URL(path).pathname)}`,
      );
      expect(
        (await http(path, jar, { method: "POST", body: form(ticket) })).status,
      ).toBe(401);
      expect(create).not.toHaveBeenCalled();
    });
    it("rejects changed account, changed profiles, empty selection, other IDs and form injection", async () => {
      const { jar, path, ticket } = await start();
      verifySiteUser.mockResolvedValue(other);
      expect(
        (await http(path, jar, { method: "POST", body: form(ticket) })).status,
      ).toBe(400);
      verifySiteUser.mockResolvedValue(userId);
      for (const body of [
        form(ticket, "allow", []),
        form(ticket, "allow", ["other"]),
        form(ticket, "allow", ["one", "one"]),
        `${form(ticket)}&decision=deny`,
        `${form(ticket)}&userId=${other}`,
        `${form(ticket)}&redirect_uri=https://evil.invalid`,
        form("tampered"),
      ])
        expect((await http(path, jar, { method: "POST", body })).status).toBe(
          400,
        );
      findFirst.mockResolvedValue({
        presets: [{ id: "one", name: "renamed" }],
      });
      expect(
        (await http(path, jar, { method: "POST", body: form(ticket) })).status,
      ).toBe(400);
      expect(create).not.toHaveBeenCalled();
      expect(claimInteraction).not.toHaveBeenCalled();
    });
    it("accepts only one concurrent submission, including a different ticket from a second tab", async () => {
      const { jar, path, ticket } = await start();
      const secondPage = await http(path, jar);
      const second = secondPage.body.match(/name="ticket" value="([^"]+)"/)![1];
      const responses = await Promise.all(
        [ticket, second].map((t) =>
          http(path, new Map(jar), { method: "POST", body: form(t) }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([303, 400]);
      expect(create).toHaveBeenCalledOnce();
    });
    it("fails closed on shared claim or DB failure and removes incomplete protocol grants", async () => {
      const first = await start();
      claimInteraction.mockRejectedValueOnce(new Error("private-token"));
      expect(
        (
          await http(first.path, first.jar, {
            method: "POST",
            body: form(first.ticket),
          })
        ).body,
      ).toBe("TEMPORARILY_UNAVAILABLE");
      expect(create).not.toHaveBeenCalled();
      const second = await start();
      create.mockRejectedValueOnce(new Error("private-birth"));
      const failure = await http(second.path, second.jar, {
        method: "POST",
        body: form(second.ticket),
      });
      expect(failure.status).toBe(503);
      expect(failure.body).toBe("TEMPORARILY_UNAVAILABLE");
      expect(
        await provider.Grant.find(create.mock.calls[0][0].data.providerGrantId),
      ).toBeUndefined();
      expect(failure.headers.location).toBeUndefined();
    });
    it("reports provider-store outages as 503 without exposing or logging the cause", async () => {
      const { jar, path } = await start();
      const lookup = vi
        .spyOn(provider.Interaction, "find")
        .mockRejectedValueOnce(new Error("private-token-birth-coordinates"));
      const logs = [
        vi.spyOn(console, "error"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "log"),
      ];
      try {
        const response = await http(path, jar);
        expect(response.status).toBe(503);
        expect(response.body).toBe("TEMPORARILY_UNAVAILABLE");
        for (const log of logs)
          expect(JSON.stringify(log.mock.calls)).not.toContain(
            "private-token-birth-coordinates",
          );
        expect(create).not.toHaveBeenCalled();
      } finally {
        lookup.mockRestore();
        for (const log of logs) log.mockRestore();
      }
    });
    it("rejects an oversized body and non-form content", async () => {
      const { jar, path, ticket } = await start();
      expect(
        (await http(path, jar, { method: "POST", body: "x".repeat(32769) }))
          .status,
      ).toBe(400);
      expect(
        (
          await http(path, jar, {
            method: "POST",
            body: form(ticket),
            headers: { "content-type": "application/json" },
          })
        ).status,
      ).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });
  },
);
