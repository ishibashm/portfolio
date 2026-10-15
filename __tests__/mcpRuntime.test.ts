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
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { mcpPersistence } from "./helpers/mcpPersistence";
import { createMcpDatabaseScope } from "@/lib/mcpRuntimeDatabase";
import { createMcpRuntime, type McpRuntime } from "@/lib/mcpRuntime";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  profile: vi.fn(),
  login: vi.fn(),
}));
vi.mock("@/lib/mcpRuntimeDatabase", async (original) => ({
  ...(await original<typeof import("@/lib/mcpRuntimeDatabase")>()),
  createMcpRuntimeDatabase: mocks.database,
}));
vi.mock("@/lib/mcpProfileStore", () => ({
  createMcpProfileStore: mocks.profile,
}));
vi.mock("@/lib/mcpSiteLogin", () => ({
  createMcpSiteLoginVerifier: () => mocks.login,
}));
vi.mock("@/lib/prisma", () => {
  throw new Error("site DB forbidden");
});
const userId = "11111111-1111-4111-8111-111111111111";
const preset = {
  id: "one",
  name: "Selected",
  birthDate: "1990-05-15T12:34",
  baseLat: 35.18,
  baseLon: 136.91,
};

describe.skipIf(Number(process.versions.node.split(".")[0]) < 22)(
  "runtime composition with real OAuth provider and MCP SDK (DB/login doubles)",
  () => {
    const persistence = mcpPersistence();
    const audit = vi.fn().mockResolvedValue({});
    const read = vi.fn().mockResolvedValue({
      presets: [preset, { ...preset, id: "two", name: "Unselected" }],
      metaphysical_config: {},
      updated_at: new Date(),
    });
    let runtime: McpRuntime;
    let server: ReturnType<typeof createServer>;
    let port: number;
    const jar = new Map<string, string>();
    async function http(
      path: string,
      body?: string,
      extra: Record<string, string> = {},
    ) {
      const url = new URL(path, "https://cloud-palette.com");
      if (url.origin !== "https://cloud-palette.com")
        throw new Error("external requests forbidden");
      return new Promise<{
        status: number;
        headers: IncomingHttpHeaders;
        body: string;
      }>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port,
            path: url.pathname + url.search,
            method: body === undefined ? "GET" : "POST",
            headers: {
              host: "cloud-palette.com",
              "x-forwarded-proto": "https",
              origin: "https://cloud-palette.com",
              cookie:
                "test=1; " + [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
              ...(body === undefined
                ? {}
                : {
                    "content-type": "application/x-www-form-urlencoded",
                    "content-length": String(Buffer.byteLength(body)),
                  }),
              ...extra,
            },
          },
          (res) => {
            for (const cookie of res.headers["set-cookie"] ?? []) {
              const [pair] = cookie.split(";");
              const index = pair.indexOf("=");
              jar.set(pair.slice(0, index), pair.slice(index + 1));
            }
            let text = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              text += chunk;
            });
            res.on("end", () =>
              resolve({
                status: res.statusCode!,
                headers: res.headers,
                body: text,
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(body);
      });
    }
    beforeAll(async () => {
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const db = persistence.db;
      Object.assign(db, {
        user_configs: { findFirst: read },
        mcpAccessAudit: { create: audit },
        mcpCalculationLease: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $queryRaw: vi.fn(async (sql: TemplateStringsArray) =>
          sql.join("").includes("clock_timestamp() AS")
            ? [{ at: new Date() }]
            : [{ userId, locked: 1, slot: 0 }],
        ),
        $executeRaw: vi.fn().mockResolvedValue(1),
      });
      mocks.database.mockReturnValue({
        db,
        scope: createMcpDatabaseScope(),
        close: vi.fn(),
      });
      mocks.profile.mockReturnValue({
        profileReader: () => read,
        close: vi.fn(),
      });
      mocks.login.mockResolvedValue(userId);
      runtime = await createMcpRuntime({
        databaseUrl: "postgresql://dummy:dummy@127.0.0.1:1/dummy",
        state: {
          lookupKey: randomBytes(32),
          activeVersion: "test",
          encryptionKeys: new Map([["test", randomBytes(32)]]),
        },
        consentKey: randomBytes(32),
        cookieKeys: [randomBytes(32).toString("hex")],
        jwks: {
          keys: [
            {
              ...privateKey.export({ format: "jwk" }),
              kid: "test",
              alg: "RS256",
              use: "sig",
            },
          ],
        },
        clients: [
          {
            client_id: "test",
            client_name: "Test",
            redirect_uris: ["https://client.invalid/callback"],
            response_types: ["code"],
            grant_types: ["authorization_code", "refresh_token"],
            token_endpoint_auth_method: "none",
          },
        ],
        login: {
          supabaseUrl: "https://test.supabase.invalid",
          publicKey: "dummy",
        },
      });
      const callback = runtime.provider.callback();
      server = createServer((req, res) => {
        const started = performance.now();
        void runtime.scope
          .run(
            {
              signal: AbortSignal.timeout(5000),
              remainingMs: () => 5000 - (performance.now() - started),
            },
            async () => {
              if (req.url?.startsWith("/oauth/interaction/"))
                return runtime.interaction(req, res);
              if (req.url === "/api/mcp/connections")
                return runtime.connections(req, res);
              Object.assign(req, { originalUrl: req.url });
              req.url = req.url?.slice("/oauth".length);
              await callback(req, res);
            },
          )
          .catch(() => {
            if (!res.headersSent) res.writeHead(503);
            if (!res.writableEnded) res.end();
          });
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
      if (runtime) await runtime.close();
    });
    beforeEach(() => {
      persistence.grants.clear();
      persistence.rows.clear();
      jar.clear();
      audit.mockClear();
    });
    async function connect() {
      const params = new URLSearchParams({
        client_id: "test",
        redirect_uri: "https://client.invalid/callback",
        response_type: "code",
        scope: "read:profiles",
        resource: MCP_PERSONAL_RESOURCE,
        code_challenge: createHash("sha256")
          .update("v".repeat(43))
          .digest("base64url"),
        code_challenge_method: "S256",
        state: "test-state",
      });
      const auth = await http(`/oauth/auth?${params}`);
      expect(auth.status).toBe(303);
      const page = await http(auth.headers.location!);
      expect(page.status).toBe(200);
      expect(page.body).not.toContain(preset.birthDate);
      const ticket = page.body.match(/name="ticket" value="([^"]+)"/)![1];
      const consent = await http(
        auth.headers.location!,
        new URLSearchParams({
          ticket,
          decision: "allow",
          profileIds: "one",
        }).toString(),
      );
      expect(consent.status).toBe(303);
      const resume = await http(consent.headers.location!);
      expect(resume.status).toBe(303);
      const code = new URL(resume.headers.location!).searchParams.get("code")!;
      const tokens = await http(
        "/oauth/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "test",
          code,
          code_verifier: "v".repeat(43),
          redirect_uri: "https://client.invalid/callback",
          resource: MCP_PERSONAL_RESOURCE,
        }).toString(),
      );
      expect(tokens.status, tokens.body).toBe(200);
      return JSON.parse(tokens.body) as {
        access_token: string;
        refresh_token: string;
      };
    }
    const call = (token: string, name = "list_profiles", args = {}) =>
      runtime.personal(
        new Request(MCP_PERSONAL_RESOURCE, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
    it("consents, executes with selected profiles only, rotates, revokes and rejects the live token", async () => {
      const tokens = await connect();
      const response = await call(tokens.access_token);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const text = await response.text();
      expect(text).toContain("Selected");
      expect(text).not.toContain("Unselected");
      expect(text).not.toContain(preset.birthDate);
      const updated = await http(
        "/oauth/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: "test",
          resource: MCP_PERSONAL_RESOURCE,
        }).toString(),
      );
      expect(updated.status).toBe(200);
      const rotated = JSON.parse(updated.body);
      expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
      const grant = [...persistence.grants.values()].find((g) => !g.revokedAt)!;
      const revoked = await http(
        "/api/mcp/connections",
        JSON.stringify({ action: "revoke", connectionId: grant.id }),
        { "content-type": "application/json", "x-mcp-management": "1" },
      );
      expect(revoked.status).toBe(200);
      read.mockClear();
      expect((await call(rotated.access_token)).status).toBe(401);
      expect(read).not.toHaveBeenCalled();
      const records = audit.mock.calls.map(([input]) => input.data);
      for (const event of ["authorize", "list_profiles", "refresh", "revoke"])
        expect(records).toContainEqual(expect.objectContaining({ event }));
      const logged = JSON.stringify(records);
      for (const secret of [
        tokens.access_token,
        tokens.refresh_token,
        preset.birthDate,
        "Selected",
        "Unselected",
        "35.18",
      ])
        expect(logged).not.toContain(secret);
    });
    it("fails closed on consent audit failure and compensates the created grant", async () => {
      audit.mockRejectedValueOnce(new Error("private audit detail"));
      await expect(connect()).rejects.toThrow();
      expect([...persistence.grants.values()].every((g) => g.revokedAt)).toBe(
        true,
      );
    });
    it("runs bounded cleanup only when explicitly invoked", async () => {
      const result = await runtime.cleanup();
      expect(result).toEqual({
        states: 1,
        audit: 1,
        rate: { buckets: 1, leases: 1 },
      });
    });
  },
);
