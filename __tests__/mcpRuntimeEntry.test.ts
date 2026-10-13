// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
const mock = vi.hoisted(() => ({
  enabled: false,
  create: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("@/lib/mcpRuntimeConfig", () => ({
  isPersonalMcpEnabled: () => mock.enabled,
  parseMcpRuntimeConfig: mock.parse,
}));
vi.mock("@/lib/mcpRuntime", () => ({ createMcpRuntime: mock.create }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.enabled = false;
});
afterEach(() => vi.restoreAllMocks());
it("closed entries do not initialize secrets, DB or provider, even with supplied credentials", async () => {
  const entry = await import("@/lib/mcpRuntimeEntry");
  const req = new Request("https://cloud-palette.com/api/mcp/personal", {
    headers: { authorization: "Bearer TEST_ONLY" },
  });
  expect((await entry.personalMcpEntry(req)).status).toBe(404);
  expect((await entry.personalMcpMetadataEntry(req)).status).toBe(404);
  expect(mock.parse).not.toHaveBeenCalled();
  expect(mock.create).not.toHaveBeenCalled();
});
it("enabled entries reject untrusted hosts before initialization and share a single runtime", async () => {
  mock.enabled = true;
  const personal = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 401 }));
  mock.create.mockResolvedValue({
    personal,
    discovery: {
      resourceMetadataResponse: () => Response.json({ resource: "test" }),
    },
  });
  const entry = await import("@/lib/mcpRuntimeEntry");
  const hostCases: Record<string, string>[] = [
    { host: "evil.invalid" },
    { host: "cloud-palette.com", "x-forwarded-host": "evil.invalid" },
    { host: "cloud-palette.com", "x-forwarded-proto": "http" },
  ];
  for (const headers of hostCases) {
    const req = new Request("https://cloud-palette.com", { headers });
    expect((await entry.personalMcpEntry(req)).status).toBe(400);
    expect((await entry.personalMcpMetadataEntry(req)).status).toBe(400);
  }
  expect(mock.create).not.toHaveBeenCalled();
  const req = new Request("https://cloud-palette.com", {
    headers: { host: "cloud-palette.com" },
  });
  expect((await entry.personalMcpEntry(req)).status).toBe(401);
  expect((await entry.personalMcpMetadataEntry(req)).status).toBe(200);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(personal.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
});
it("initialization failure is redacted and can recover", async () => {
  mock.enabled = true;
  mock.create
    .mockRejectedValueOnce(new Error("TEST_ONLY_PRIVATE_SECRET"))
    .mockResolvedValue({
      personal: async () => new Response(null, { status: 401 }),
    });
  const entry = await import("@/lib/mcpRuntimeEntry");
  const req = new Request("https://cloud-palette.com", {
    headers: { host: "cloud-palette.com" },
  });
  const response = await entry.personalMcpEntry(req);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("TEST_ONLY_PRIVATE_SECRET");
  expect((await entry.personalMcpEntry(req)).status).toBe(401);
});
it("native entry keeps the canonical OAuth mount, rejects unknown routes and oversized chunks", async () => {
  mock.enabled = true;
  const observed: string[] = [];
  mock.create.mockResolvedValue({
    scope: {
      run: async (_budget: unknown, work: () => Promise<void>) => work(),
    },
    provider: {
      callback:
        () =>
        async (
          req: import("node:http").IncomingMessage,
          res: import("node:http").ServerResponse,
        ) => {
          observed.push(req.url!);
          for await (const _chunk of req) {
            void _chunk;
          }
          if (!res.writableEnded) res.end("ok");
        },
    },
  });
  const { mcpNodeEntry } = await import("@/lib/mcpRuntimeEntry");
  const server = createServer((req, res) => {
    void mcpNodeEntry(req, res, "oauth", [req.url!.split("?")[0].slice(1)]);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  async function send(path: string, body = "") {
    return new Promise<number>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            host: "cloud-palette.com",
            "transfer-encoding": "chunked",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  try {
    expect(await send("/register")).toBe(404);
    expect(mock.create).not.toHaveBeenCalled();
    expect(await send("/token?x=1", "grant_type=test")).toBe(200);
    expect(observed).toEqual(["/token?x=1"]);
    expect(await send("/token", "x".repeat(32769))).toBe(413);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
