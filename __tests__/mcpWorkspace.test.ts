// @vitest-environment node
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createMcpWorkspaceHandler } from "@/lib/mcpWorkspace";
const mocks = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/lib/mcpSiteLogin", () => ({
  createMcpSiteLoginVerifier: () => mocks.login,
}));
const owner = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubEnv("MCP_CONSOLE_ENABLED", "true");
  vi.stubEnv("MCP_MEMORY_ENABLED", "true");
  mocks.login.mockResolvedValue(owner);
});
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const deps = {
    db: {
      user_configs: { findFirst: vi.fn().mockResolvedValue(null) },
      mcpAccessAudit: { findMany: vi.fn().mockResolvedValue([]) },
    },
    login: { supabaseUrl: "https://example.invalid", publicKey: "test" },
    memory: { run: vi.fn().mockResolvedValue({ memories: [] }) },
    audit: { record: vi.fn() },
    rate: {
      reserve: vi.fn().mockResolvedValue({ allowed: true }),
      release: vi.fn(),
    },
  };
  const handler = createMcpWorkspaceHandler(
    deps as unknown as Parameters<typeof createMcpWorkspaceHandler>[0],
  );
  async function call(body: unknown, headers: Record<string, string> = {}) {
    const req = Readable.from([
      Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
    ]);
    Object.assign(req, {
      method: "POST",
      headers: {
        host: "cloud-palette.com",
        origin: "https://cloud-palette.com",
        "x-mcp-management": "1",
        "content-type": "application/json",
        ...headers,
      },
    });
    let status = 0;
    let value = "";
    const res = {
      writableEnded: false,
      setHeader: vi.fn(),
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(text: string) {
        value = text;
        this.writableEnded = true;
      },
    };
    await handler(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
    );
    return { status, value: JSON.parse(value), headers: res.setHeader };
  }
  return { deps, call };
}
it("rejects flag-off before login or DB access", async () => {
  vi.stubEnv("MCP_CONSOLE_ENABLED", "false");
  vi.stubEnv("MCP_MEMORY_ENABLED", "false");
  const { call, deps } = fixture();
  expect((await call({ action: "history" })).status).toBe(404);
  expect(deps.rate.reserve).not.toHaveBeenCalled();
});
it("rejects CSRF and missing login before reading memory", async () => {
  const { call, deps } = fixture();
  expect(
    (
      await call(
        { action: "memory", operation: "list" },
        { origin: "https://evil.invalid" },
      )
    ).status,
  ).toBe(400);
  mocks.login.mockResolvedValue(null);
  expect((await call({ action: "memory", operation: "list" })).status).toBe(
    401,
  );
  expect(deps.memory.run).not.toHaveBeenCalled();
});
it("binds memory to authenticated owner and audits no contents", async () => {
  const { call, deps } = fixture();
  const note = { title: "SECRET", text: "PRIVATE", category: "other" };
  expect(
    (await call({ action: "memory", operation: "create", value: note })).status,
  ).toBe(200);
  expect(deps.memory.run).toHaveBeenCalledWith(owner, "create", note);
  expect(JSON.stringify(deps.audit.record.mock.calls)).not.toMatch(
    /SECRET|PRIVATE/,
  );
  expect(deps.audit.record.mock.calls[0][0]).toMatchObject({
    userId: owner,
    grantId: null,
    event: "create_memory",
  });
});
it("projects only unexpired own external audit entries", async () => {
  const { call, deps } = fixture();
  expect((await call({ action: "history" })).value).toEqual({
    history: [],
    nextCursor: null,
  });
  const query = deps.db.mcpAccessAudit.findMany.mock.calls[0][0];
  expect(query.where).toMatchObject({ userId: owner, grantId: { not: null } });
  expect(Object.keys(query.select)).toEqual([
    "requestId",
    "grantId",
    "event",
    "result",
    "occurredAt",
    "durationMs",
  ]);
});
it("uses actual public MCP tools and exposes neither private tools nor input failures", async () => {
  const { call } = fixture();
  const listing = await call({ action: "tools", personal: false });
  expect(
    listing.value.tools.some(
      (tool: { name: string }) => tool.name === "list_memories",
    ),
  ).toBe(false);
  const output = await call({
    action: "call",
    personal: false,
    name: "get_honmei_star",
    arguments: { birthDate: "1990-05-05" },
  });
  expect(output.status).toBe(200);
  expect(output.value.content).toBeDefined();
  const invalid = await call({
    action: "call",
    personal: false,
    name: "get_honmei_star",
    arguments: { birthDate: "SECRET" },
  });
  expect(JSON.stringify(invalid.value)).not.toContain("SECRET");
});
it("bounds body and denies caller-supplied owner", async () => {
  const { call, deps } = fixture();
  expect((await call("x".repeat(32769))).status).toBe(413);
  expect((await call({ action: "history", userId: owner })).status).toBe(400);
  expect(deps.rate.reserve).not.toHaveBeenCalled();
});
it("fails closed and redacts backend exceptions", async () => {
  const { call, deps } = fixture();
  deps.memory.run.mockRejectedValue(new Error("SECRET"));
  expect(await call({ action: "memory", operation: "list" })).toMatchObject({
    status: 503,
    value: { error: "TEMPORARILY_UNAVAILABLE" },
  });
});
