// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: { findFirst } } }));
import { createMcpPersonalServer } from "@/lib/mcpPersonalServer";
import { createMcpServer } from "@/lib/mcpServer";
import { mcpAuditEvent } from "@/lib/mcpAuditStore";
const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "22222222-2222-4222-8222-222222222222",
  clientId: "test-client",
  allowedProfileIds: ["one"],
};
const preset = {
  id: "one",
  name: "private-name",
  birthDate: "1990-05-15",
  baseLat: 35,
  baseLon: 139,
};
const closers: (() => Promise<void>)[] = [];
async function connect(server: McpServer) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  closers.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    presets: [preset],
    metaphysical_config: {},
    updated_at: new Date("2026-10-12T00:00:00Z"),
  });
});
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});
describe("request-local personal MCP server", () => {
  it("registers exactly eleven unique audited tools while public discovery stays at thirteen", async () => {
    const personal = await connect(createMcpPersonalServer(auth));
    const publicClient = await connect(createMcpServer());
    const tools = (await personal.listTools()).tools;
    expect(tools.map((t) => t.name)).toEqual([
      "get_kanshi",
      "get_honmei_star",
      "judge_directions",
      "find_auspicious_days",
      "search_municipality",
      "area_directions",
      "prefecture_summary",
      "list_profiles",
      "get_profile",
      "judge_profile_directions",
      "judge_time_slots",
    ]);
    for (const tool of tools)
      expect(mcpAuditEvent.safeParse(tool.name).success).toBe(true);
    expect((await publicClient.listTools()).tools).toHaveLength(13);
    expect(JSON.stringify(tools)).not.toContain(preset.name);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("keeps explicit calculations equal to public outputs without reading profiles", async () => {
    const personal = await connect(createMcpPersonalServer(auth));
    const publicClient = await connect(createMcpServer());
    for (const call of [
      { name: "get_honmei_star", arguments: { birthDate: "1990-05-15" } },
      { name: "get_kanshi", arguments: { birthDate: "1990-05-15" } },
      {
        name: "judge_directions",
        arguments: { birthDate: "1990-05-15", lon: 139, date: "2026-10-12" },
      },
      {
        name: "judge_time_slots",
        arguments: {
          birthDate: "1990-05-15",
          lat: 35,
          lon: 139,
          date: "2026-10-12",
        },
      },
    ]) {
      expect(await personal.callTool(call)).toEqual(
        await publicClient.callTool(call),
      );
    }
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("isolates concurrent users and snapshots the allowed selection", async () => {
    const selection = ["one"];
    const one = await connect(
      createMcpPersonalServer({ ...auth, allowedProfileIds: selection }),
    );
    const otherId = "33333333-3333-4333-8333-333333333333";
    const two = await connect(
      createMcpPersonalServer({
        ...auth,
        userId: otherId,
        allowedProfileIds: ["two"],
      }),
    );
    selection.push("two");
    findFirst.mockImplementation(async ({ where }) => ({
      presets: [
        preset,
        {
          ...preset,
          id: "two",
          name: where.user_id === otherId ? "other-user" : "unshared",
        },
      ],
      metaphysical_config: {},
      updated_at: new Date("2026-10-12T00:00:00Z"),
    }));
    const [a, b] = await Promise.all(
      [one, two].map((c) =>
        c.callTool({ name: "list_profiles", arguments: {} }),
      ),
    );
    expect(JSON.stringify(a)).toContain("private-name");
    expect(JSON.stringify(a)).not.toMatch(/other-user|unshared/);
    expect(JSON.stringify(b)).toContain("other-user");
    expect(JSON.stringify(b)).not.toContain("private-name");
    expect(findFirst.mock.calls.map(([q]) => q.where.user_id).sort()).toEqual(
      [auth.userId, otherId].sort(),
    );
  });
});
