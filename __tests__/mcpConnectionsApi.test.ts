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
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpConnectionsHandler } from "@/lib/mcpConnectionsApi";
import { McpConnectionError } from "@/lib/mcpConnections";

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
const id = "33333333-3333-4333-8333-333333333333";
const service = {
  list: vi.fn().mockResolvedValue({ connections: [], nextCursor: null }),
  revoke: vi.fn().mockResolvedValue({ revoked: true }),
  revokeAll: vi.fn().mockResolvedValue({ revoked: true }),
  reduceProfiles: vi.fn().mockResolvedValue({ updated: true }),
};
const handler = createMcpConnectionsHandler({
  service,
  login: {
    supabaseUrl: "https://test.supabase.invalid",
    publicKey: "dummy-public-key",
  },
});
let server: ReturnType<typeof createServer>;
let port: number;
async function http(
  options: {
    method?: string;
    path?: string;
    body?: string;
    headers?: Record<string, string | undefined>;
  } = {},
) {
  const method = options.method ?? "GET";
  const headers = {
    host: "cloud-palette.com",
    cookie: "sb-test-auth-token=dummy-cookie",
    ...(method === "POST"
      ? {
          origin: "https://cloud-palette.com",
          "x-mcp-management": "1",
          "content-type": "application/json",
        }
      : {}),
    ...options.headers,
  };
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path: options.path ?? "/api/mcp/connections",
        headers: Object.fromEntries(
          Object.entries(headers).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
      },
      (res) => {
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
beforeAll(async () => {
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});
beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockReturnValue({ auth: { getUser } });
  getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
});

describe("dormant cookie-authenticated connection management HTTP", () => {
  it("lists only the remotely verified subject, uses the cursor, and never caches", async () => {
    const result = await http({ path: `/api/mcp/connections?after=${id}` });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      connections: [],
      nextCursor: null,
    });
    expect(service.list).toHaveBeenCalledWith(userId, id);
    expect(getUser).toHaveBeenCalledExactlyOnceWith();
    expect(createClient.mock.calls[0][2].cookies.getAll()).toEqual([
      { name: "sb-test-auth-token", value: "dummy-cookie" },
    ]);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.headers.vary).toBe("Cookie");
    expect(result.headers["access-control-allow-origin"]).toBeUndefined();
  });
  it.each([
    { action: "revoke", connectionId: id },
    { action: "revokeAll" },
    { action: "reduceProfiles", connectionId: id, profileIds: ["one"] },
  ])("dispatches validated $action with site identity", async (body) => {
    const result = await http({ method: "POST", body: JSON.stringify(body) });
    expect(result.status).toBe(200);
    if (body.action === "revoke")
      expect(service.revoke).toHaveBeenCalledWith(userId, id);
    if (body.action === "revokeAll")
      expect(service.revokeAll).toHaveBeenCalledWith(userId);
    if (body.action === "reduceProfiles")
      expect(service.reduceProfiles).toHaveBeenCalledWith(userId, id, ["one"]);
  });
  it.each([
    { origin: undefined },
    { origin: "null" },
    { origin: "https://evil.invalid" },
    { "x-mcp-management": undefined },
    { "x-mcp-management": "2" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { host: "evil.invalid" },
    { "x-forwarded-host": "evil.invalid" },
    { "x-forwarded-proto": "http" },
  ])(
    "rejects CSRF or hostile proxy headers before authentication: %j",
    async (headers) => {
      const result = await http({
        method: "POST",
        body: '{"action":"revokeAll"}',
        headers,
      });
      expect(result.status).toBe(400);
      expect(getUser).not.toHaveBeenCalled();
      expect(service.revokeAll).not.toHaveBeenCalled();
      expect(result.headers["cache-control"]).toBe("private, no-store");
    },
  );
  it("does not accept a Bearer token in place of site cookies", async () => {
    const result = await http({
      headers: { cookie: undefined, authorization: "Bearer dummy-mcp-token" },
    });
    expect(result.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });
  it.each([null, "dev-bypass-id", "email@example.invalid"])(
    "rejects missing/invalid remote subject %s",
    async (subject) => {
      getUser.mockResolvedValue({
        data: { user: subject ? { id: subject } : null },
        error: null,
      });
      expect(
        (await http({ headers: { cookie: "dev_bypass_user=dummy" } })).status,
      ).toBe(401);
      expect(service.list).not.toHaveBeenCalled();
    },
  );
  it("rejects getUser errors even when a user was returned", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: new Error("private-token"),
    });
    expect((await http()).status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });
  it.each(["PUT", "DELETE", "OPTIONS"])(
    "rejects %s without auth or IO",
    async (method) => {
      const result = await http({ method });
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe("GET, POST");
      expect(getUser).not.toHaveBeenCalled();
    },
  );
  it.each([
    '{"action":"revokeAll","userId":"attacker"}',
    '{"action":"revoke","connectionId":"bad"}',
    '{"action":"reduceProfiles","connectionId":"' + id + '","profileIds":[1]}',
    '{"action":"unknown"}',
    "null",
    "{broken",
  ])("rejects invalid bodies without mutation: %s", async (body) => {
    expect((await http({ method: "POST", body })).status).toBe(400);
    expect(service.revoke).not.toHaveBeenCalled();
    expect(service.revokeAll).not.toHaveBeenCalled();
    expect(service.reduceProfiles).not.toHaveBeenCalled();
  });
  it.each([
    { "content-type": "application/x-www-form-urlencoded" },
    { "content-encoding": "gzip" },
  ])("rejects simple forms/compression: %j", async (headers) => {
    expect(
      (await http({ method: "POST", headers, body: '{"action":"revokeAll"}' }))
        .status,
    ).toBe(400);
    expect(service.revokeAll).not.toHaveBeenCalled();
  });
  it("bounds chunked bodies even without Content-Length", async () => {
    expect(
      (
        await http({
          method: "POST",
          headers: { "transfer-encoding": "chunked" },
          body: " ".repeat(32769),
        })
      ).status,
    ).toBe(400);
    expect(service.revokeAll).not.toHaveBeenCalled();
  });
  it.each(["?userId=attacker", `?after=${id}&after=${id}`, "/wrong"])(
    "rejects ambiguous management URLs %s",
    async (suffix) => {
      expect(
        (await http({ path: `/api/mcp/connections${suffix}` })).status,
      ).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    },
  );
  it("rejects POST query values and cross-origin GET", async () => {
    expect(
      (
        await http({
          method: "POST",
          path: "/api/mcp/connections?after=x",
          body: '{"action":"revokeAll"}',
        })
      ).status,
    ).toBe(400);
    expect(
      (await http({ headers: { origin: "https://evil.invalid" } })).status,
    ).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.revokeAll).not.toHaveBeenCalled();
  });
  it.each([
    { code: "NOT_FOUND" as const, status: 404 },
    { code: "INVALID_REQUEST" as const, status: 400 },
    { code: "TEMPORARILY_UNAVAILABLE" as const, status: 503 },
  ])("maps sanitized service errors: $code", async ({ code, status }) => {
    service.revoke.mockRejectedValueOnce(new McpConnectionError(code));
    const result = await http({
      method: "POST",
      body: JSON.stringify({ action: "revoke", connectionId: id }),
    });
    expect(result.status).toBe(status);
    expect(JSON.parse(result.body)).toEqual({ error: code });
  });
  it("sanitizes raw auth/service failures and does not log private values", async () => {
    const spies = [
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "log"),
    ];
    try {
      getUser.mockRejectedValueOnce(
        new Error("private-birth-coordinates-token"),
      );
      service.list.mockRejectedValueOnce(
        new Error("private-birth-coordinates-token"),
      );
      for (let i = 0; i < 2; i++) {
        const result = await http();
        expect(result.status).toBe(503);
        expect(result.body).toBe('{"error":"TEMPORARILY_UNAVAILABLE"}');
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
  it("keeps parallel users isolated and carries refreshed secure cookies", async () => {
    createClient.mockImplementation((_url, _key, options) => {
      const cookie = options.cookies.getAll()[0]?.value;
      return {
        auth: {
          getUser: async () => {
            await new Promise((resolve) =>
              setTimeout(resolve, cookie === "one" ? 10 : 0),
            );
            options.cookies.setAll([
              {
                name: "sb-test-auth-token",
                value: "rotated-dummy",
                options: { path: "/" },
              },
            ]);
            return {
              data: { user: { id: cookie === "one" ? userId : other } },
              error: null,
            };
          },
        },
      };
    });
    const results = await Promise.all([
      http({ headers: { cookie: "sb-test-auth-token=one" } }),
      http({ headers: { cookie: "sb-test-auth-token=two" } }),
    ]);
    expect(service.list.mock.calls.map(([subject]) => subject).sort()).toEqual(
      [userId, other].sort(),
    );
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.headers["set-cookie"]?.[0]).toMatch(/Secure; SameSite=Lax/);
    }
  });
});
