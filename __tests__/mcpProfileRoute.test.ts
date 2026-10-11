// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createServer: vi.fn(),
  connect: vi.fn(),
  closeServer: vi.fn(),
  constructTransport: vi.fn(),
  handleRequest: vi.fn(),
  closeTransport: vi.fn(),
  loaders: [] as Array<() => Promise<unknown>>,
  verify: vi.fn(),
}));
vi.mock("@/lib/mcpOAuth", () => ({
  PROFILE_RESOURCE_METADATA:
    "https://cloud-palette.com/.well-known/oauth-protected-resource/api/mcp/profile",
  verifyProfileToken: mocks.verify,
}));
vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/mcpProfileServer", () => ({
  createProfileMcpServer: mocks.createServer,
}));
vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: class {
      constructor(options: unknown) {
        mocks.constructTransport(options);
      }
      handleRequest = mocks.handleRequest;
      close = mocks.closeTransport;
    },
  }),
);

import { DELETE, GET, POST } from "@/app/api/mcp/profile/route";
const USER_A = "11111111-2222-4333-8444-555555555555";
const USER_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
function request(headers: Record<string, string> = {}): Request {
  return new Request("https://cloud-palette.com/api/mcp/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer opaque-mcp-token",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("/api/mcp/profile OAuth resource server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loaders.length = 0;
    vi.stubEnv("NODE_ENV", "test");
    mocks.verify.mockResolvedValue({ status: "ok", userId: USER_A });
    mocks.findUnique.mockResolvedValue({ presets: [{ id: "preset-a" }] });
    mocks.createServer.mockImplementation((load: () => Promise<unknown>) => {
      mocks.loaders.push(load);
      return { connect: mocks.connect, close: mocks.closeServer };
    });
    mocks.connect.mockResolvedValue(undefined);
    mocks.closeServer.mockResolvedValue(undefined);
    mocks.closeTransport.mockResolvedValue(undefined);
    mocks.handleRequest.mockImplementation(async () =>
      Response.json({ result: await mocks.loaders[0]() }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["", "Basic abc", "Bearer", "Bearer a b", "Bearer a,Bearer b"])(
    "rejects malformed bearer authorization: %s",
    async (authorization) => {
      const response = await POST(request({ Authorization: authorization }));
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain(
        "resource_metadata=",
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.findUnique).not.toHaveBeenCalled();
    },
  );
  it("does not use cookies or development bypass for authentication", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const incoming = request({ Cookie: "dev_bypass_user=owner@example.com" });
    incoming.headers.delete("Authorization");
    expect((await POST(incoming)).status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each(["unauthorized", "unavailable"])(
    "fails closed on %s introspection",
    async (status) => {
      mocks.verify.mockResolvedValue({ status });
      const response = await POST(request());
      expect(response.status).toBe(status === "unauthorized" ? 401 : 503);
      expect(mocks.verify).toHaveBeenCalledWith("opaque-mcp-token");
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.createServer).not.toHaveBeenCalled();
    },
  );
  it("uses only the introspected subject as the exact user_id", async () => {
    const response = await POST(
      request({ Cookie: "dev_bypass_user=someone-else@example.com" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { user_id: USER_A },
      select: { presets: true },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.constructTransport).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    expect(mocks.closeTransport).toHaveBeenCalledOnce();
    expect(mocks.closeServer).toHaveBeenCalledOnce();
  });
  it("does not mix principals across requests or fall back to email", async () => {
    mocks.handleRequest.mockResolvedValue(Response.json({ result: {} }));
    await POST(request());
    mocks.verify.mockResolvedValue({ status: "ok", userId: USER_B });
    await POST(request({ Authorization: "Bearer another-opaque-token" }));
    await Promise.all(mocks.loaders.map((load) => load()));
    expect(mocks.findUnique.mock.calls).toEqual([
      [{ where: { user_id: USER_A }, select: { presets: true } }],
      [{ where: { user_id: USER_B }, select: { presets: true } }],
    ]);
  });
  it("sanitizes database failures", async () => {
    mocks.findUnique.mockRejectedValue(
      new Error("private coordinates and database password"),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/coordinates|password/);
    await expect(mocks.loaders[0]()).rejects.toThrow(
      "Profile service is temporarily unavailable",
    );
  });
  it.each([
    "https://untrusted.example",
    "https://cloud-palette.com.untrusted.example",
    "null",
    "http://localhost:3000",
  ])("rejects untrusted Origin before introspection: %s", async (origin) => {
    expect((await POST(request({ Origin: origin }))).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("accepts canonical Origin and local development Origin", async () => {
    expect(
      (await POST(request({ Origin: "https://cloud-palette.com" }))).status,
    ).toBe(200);
    vi.stubEnv("NODE_ENV", "development");
    expect(
      (await POST(request({ Origin: "http://localhost:3000" }))).status,
    ).toBe(200);
  });
  it("returns 405 for GET and DELETE", async () => {
    for (const handler of [GET, DELETE]) {
      const response = await handler(request());
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect((await handler(request({ Origin: "null" }))).status).toBe(403);
    }
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
