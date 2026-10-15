// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: { findFirst } } }));
import {
  registerPersonalCalculationTools,
  personalDirectionsOutputSchema,
  personalTimeSlotsOutputSchema,
} from "@/lib/mcpPersonalCalculationTools";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import { calculateTimeSlots } from "@/lib/timeSlots";
const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "grant",
  clientId: "client",
  allowedProfileIds: ["one", "two"],
};
const preset = {
  id: "one",
  name: "名古屋",
  birthDate: "1990-02-04",
  baseLat: 35.18,
  baseLon: 136.91,
  encryptedGeminiKey: "secret-marker",
};
const clients: Client[] = [];
const servers: McpServer[] = [];
const requestedAt = new Date("2026-10-11T15:00:00Z");
async function connect(context = auth) {
  const server = new McpServer({ name: "test", version: "0" });
  registerPersonalCalculationTools(server, context, requestedAt);
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
describe("個人用計算のSDK境界", () => {
  it("discovery discloses schemas without reading stored data", async () => {
    const c = await connect();
    const tools = await c.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual([
      "judge_profile_directions",
      "judge_time_slots",
    ]);
    for (const tool of tools.tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each(["1990-02-04", "1990-02-04T01:30", "1990-02-03T16:30Z"])(
    "daily matches existing MCP and never echoes calculation inputs: %s",
    async (birthDate) => {
      findFirst.mockResolvedValue(
        row([{ ...preset, birthDate }], {
          direction_filter_mode: "personal_bazi",
        }),
      );
      const c = await connect();
      const input = {
        profile: { id: "one" },
        date: "2026-12-31",
        tenchusatsuMode: "off",
        involuntaryMove: true,
        directionFilterMode: "environmental",
      };
      const r = await c.callTool({
        name: "judge_profile_directions",
        arguments: input,
      });
      expect(r.isError).not.toBe(true);
      const payload = personalDirectionsOutputSchema.parse(parse(r));
      expect(r.structuredContent).toEqual(payload);
      const direct = calculateMcpDirections({
        birthDate,
        lon: preset.baseLon,
        ...input,
      });
      expect(direct.ok).toBe(true);
      if (direct.ok) expect(payload).toMatchObject(direct.payload);
      expect(payload.settingsSources).toMatchObject({
        directionFilterMode: "explicit",
        tenchusatsuMode: "explicit",
        involuntaryMove: "explicit",
      });
      expect(JSON.stringify(r)).not.toContain(birthDate);
      expect(JSON.stringify(r)).not.toContain("136.91");
      expect(JSON.stringify(r)).not.toContain("secret-marker");
    },
  );
  it("daily resolves saved/default sources and JST request-start day", async () => {
    findFirst.mockResolvedValue(
      row([preset], { direction_filter_mode: "personal_kigaku" }),
    );
    const c = await connect();
    const r = await c.callTool({
      name: "judge_profile_directions",
      arguments: { profile: { id: "one" } },
    });
    const payload = personalDirectionsOutputSchema.parse(parse(r));
    expect(payload.date).toBe("2026-10-12");
    expect(payload.settingsUsed).toMatchObject({
      directionFilterMode: "personal_kigaku",
      birthDateInterpretation: "date-only-jst-noon",
    });
    expect(payload.settingsSources).toMatchObject({
      directionFilterMode: "account",
      tenchusatsuMode: "default",
      involuntaryMove: "default",
    });
  });
  it.each([
    { presets: [{ ...preset, voidZodiacOverride: "辰巳" }], config: {} },
    { presets: [preset], config: { direction_filter_mode: "kigaku_env" } },
    { presets: [preset], config: { use_classical_board: false } },
  ])(
    "daily refuses unsupported saved configuration even with explicit override",
    async ({ presets, config }) => {
      findFirst.mockResolvedValue(row(presets, config));
      const c = await connect();
      const r = await c.callTool({
        name: "judge_profile_directions",
        arguments: { profile: { id: "one" }, directionFilterMode: "composite" },
      });
      expect(parse(r).error.code).toBe("UNSUPPORTED_SETTINGS");
    },
  );
  it("time slots match the screen adapter including board and override provenance", async () => {
    findFirst.mockResolvedValue(
      row([{ ...preset, voidZodiacOverride: "辰巳" }], {
        use_classical_board: true,
      }),
    );
    const c = await connect();
    for (const override of [undefined, "", "子丑"]) {
      const args = {
        profile: { id: "one" },
        date: "2026-02-04",
        includeBoard: true,
        ...(override === undefined
          ? {}
          : { settings: { voidZodiacOverride: override } }),
      };
      const r = await c.callTool({ name: "judge_time_slots", arguments: args });
      expect(r.isError).not.toBe(true);
      const payload = personalTimeSlotsOutputSchema.parse(parse(r));
      expect(r.structuredContent).toEqual(payload);
      const direct = calculateTimeSlots({
        birthDate: preset.birthDate,
        lat: preset.baseLat,
        lon: preset.baseLon,
        date: args.date,
        includeBoard: true,
        settings: {
          useClassicalBoard: true,
          voidZodiacOverride: override ?? "辰巳",
        },
      });
      expect(payload.slots).toEqual(direct.slots);
      expect(payload.coverage).toEqual(direct.coverage);
      expect(payload.settingsUsed).toEqual(direct.settingsUsed);
      expect(payload.settingsSources).toEqual({
        useClassicalBoard: "account",
        voidZodiacOverride: override === undefined ? "preset" : "explicit",
      });
      expect(JSON.stringify(r)).not.toContain(preset.birthDate);
      expect(JSON.stringify(r)).not.toContain("136.91");
    }
  });
  it("explicit time input performs no DB read and matches public adapter", async () => {
    const c = await connect();
    const args = {
      birthDate: preset.birthDate,
      lat: preset.baseLat,
      lon: preset.baseLon,
    };
    const r = await c.callTool({ name: "judge_time_slots", arguments: args });
    expect(parse(r)).toEqual(calculateTimeSlots(args, requestedAt));
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([
    { profile: { id: "one" }, birthDate: preset.birthDate },
    { profile: { id: "one" }, lat: 35 },
    { profile: { id: "one" }, lon: 136 },
    { birthDate: preset.birthDate, lon: 136 },
    { profile: { id: "one" }, userId: auth.userId },
    { profile: { id: "one" }, date: "2026-02-30" },
    { profile: { id: "one" }, settings: { unknown: true } },
  ])(
    "rejects mixed, partial and invalid time inputs before DB",
    async (args) => {
      const c = await connect();
      expect(
        (await c.callTool({ name: "judge_time_slots", arguments: args }))
          .isError,
      ).toBe(true);
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it.each(["judge_profile_directions", "judge_time_slots"])(
    "%s protects unshared/deleted/ambiguous/incomplete data and DB errors",
    async (name) => {
      const c = await connect();
      findFirst.mockResolvedValue(
        row([preset, { ...preset, id: "two" }, { ...preset, id: "hidden" }]),
      );
      for (const id of ["hidden", "deleted"])
        expect(
          parse(await c.callTool({ name, arguments: { profile: { id } } }))
            .error.code,
        ).toBe("PROFILE_NOT_FOUND");
      const ambiguity = parse(
        await c.callTool({
          name,
          arguments: { profile: { name: preset.name } },
        }),
      );
      expect(
        ambiguity.error.candidates.map((p: { id: string }) => p.id),
      ).toEqual(["one", "two"]);
      findFirst.mockResolvedValue(row([{ id: "one", name: "incomplete" }]));
      expect(
        parse(await c.callTool({ name, arguments: { profile: { id: "one" } } }))
          .error.code,
      ).toBe("PROFILE_INCOMPLETE");
      findFirst.mockRejectedValue(new Error("secret-marker"));
      expect(
        parse(
          await c.callTool({ name, arguments: { profile: { id: "one" } } }),
        ),
      ).toEqual({
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "TEMPORARILY_UNAVAILABLE",
        },
      });
    },
  );
  it("time rejects explicit non-classical mode", async () => {
    const c = await connect();
    const r = await c.callTool({
      name: "judge_time_slots",
      arguments: {
        profile: { id: "one" },
        settings: { useClassicalBoard: false },
      },
    });
    expect(parse(r).error.code).toBe("UNSUPPORTED_SETTINGS");
  });
});
