// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: { findFirst } } }));
vi.mock("@/lib/userConfig", () => {
  throw new Error("no site login");
});
import {
  registerPersonalProfileTools,
  getProfileOutputSchema,
  listProfilesOutputSchema,
} from "@/lib/mcpPersonalTools";
const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "grant",
  clientId: "client",
  allowedProfileIds: ["one", "two"],
};
const preset = {
  id: "one",
  name: "<b>名古屋</b>",
  birthDate: "1990-05-15T12:34",
  baseLat: 35.18,
  baseLon: 136.91,
  encryptedGeminiKey: "secret-marker",
};
const clients: Client[] = [];
const servers: McpServer[] = [];
async function connect(context = auth) {
  const server = new McpServer({ name: "test", version: "0" });
  registerPersonalProfileTools(server, context);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  clients.push(client);
  servers.push(server);
  return client;
}
const parse = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as { text: string }[])[0].text);
function row(presets: unknown = [preset], metaphysical_config: unknown = {}) {
  return {
    presets,
    metaphysical_config,
    updated_at: new Date("2026-10-11T00:00:00Z"),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(row());
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
describe("未接続の個人用プロフィールツール", () => {
  it("discovery has schemas and read-only hints but no profile names", async () => {
    const c = await connect();
    const tools = await c.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual([
      "list_profiles",
      "get_profile",
    ]);
    for (const t of tools.tools) {
      expect(t.outputSchema).toBeDefined();
      expect(t.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
    expect(JSON.stringify(tools)).not.toContain(preset.name);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("matches text/structured schemas and discloses inputs only with literal true", async () => {
    const c = await connect();
    const list = await c.callTool({ name: "list_profiles", arguments: {} });
    expect(list.structuredContent).toEqual(parse(list));
    listProfilesOutputSchema.parse(parse(list));
    for (const include of [undefined, false, true]) {
      const r = await c.callTool({
        name: "get_profile",
        arguments: {
          profile: { id: "one" },
          ...(include === undefined
            ? {}
            : { includeCalculationInputs: include }),
        },
      });
      expect(r.isError).not.toBe(true);
      expect(r.structuredContent).toEqual(parse(r));
      getProfileOutputSchema.parse(parse(r));
      expect(JSON.stringify(r).includes(preset.birthDate)).toBe(
        include === true,
      );
      expect(JSON.stringify(r)).not.toContain("secret-marker");
    }
  });
  it.each([
    { profile: { id: "one", name: "名古屋" } },
    { profile: { id: "one" }, userId: auth.userId },
    { profile: { id: "one" }, includeCalculationInputs: "true" },
  ])("rejects ambiguous selector/context injection before DB", async (args) => {
    const c = await connect();
    const r = await c.callTool({ name: "get_profile", arguments: args });
    expect(r.isError).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("same error for deleted, nonexistent and unshared IDs; only allowed ambiguity candidates", async () => {
    findFirst.mockResolvedValue(
      row([preset, { ...preset, id: "two" }, { ...preset, id: "hidden" }]),
    );
    const c = await connect();
    for (const id of ["deleted", "hidden"]) {
      const r = await c.callTool({
        name: "get_profile",
        arguments: { profile: { id } },
      });
      expect(parse(r).error.code).toBe("PROFILE_NOT_FOUND");
    }
    const r = await c.callTool({
      name: "get_profile",
      arguments: { profile: { name: preset.name } },
    });
    expect(parse(r).error).toEqual({
      code: "AMBIGUOUS_PROFILE",
      message: "AMBIGUOUS_PROFILE",
      candidates: ["one", "two"].map((id) => ({ id, name: preset.name })),
    });
  });
  it("separates concurrent owners and snapshots the allowed set", async () => {
    const own = { ...auth, allowedProfileIds: ["one"] };
    const a = await connect(own);
    own.allowedProfileIds.push("hidden");
    const other = {
      ...auth,
      userId: "22222222-2222-4222-8222-222222222222",
      allowedProfileIds: ["other"],
    };
    const b = await connect(other);
    findFirst.mockImplementation(async ({ where }) =>
      row(
        where.user_id === auth.userId
          ? [preset, { ...preset, id: "hidden" }]
          : [{ ...preset, id: "other", name: "other owner" }],
      ),
    );
    const [ra, rb] = await Promise.all(
      [a, b].map((c) => c.callTool({ name: "list_profiles", arguments: {} })),
    );
    expect(parse(ra).profiles.map((p: { id: string }) => p.id)).toEqual([
      "one",
    ]);
    expect(parse(rb).profiles.map((p: { id: string }) => p.id)).toEqual([
      "other",
    ]);
  });
  it("empty storage does not claim local data exists; errors reveal no raw DB input", async () => {
    const c = await connect();
    findFirst.mockResolvedValue(null);
    expect(
      parse(await c.callTool({ name: "list_profiles", arguments: {} }))
        .profiles,
    ).toEqual([]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      findFirst.mockRejectedValue(new Error("secret-marker birthDate"));
      const r = await c.callTool({ name: "list_profiles", arguments: {} });
      expect(parse(r)).toEqual({
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "TEMPORARILY_UNAVAILABLE",
        },
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("refuses unsupported stored settings", async () => {
    findFirst.mockResolvedValue(row([preset], { use_classical_board: false }));
    const c = await connect();
    expect(
      parse(
        await c.callTool({
          name: "get_profile",
          arguments: { profile: { id: "one" } },
        }),
      ).error.code,
    ).toBe("UNSUPPORTED_SETTINGS");
  });
});
