import { beforeEach, describe, expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: { findFirst } } }));
vi.mock("@/lib/userConfig", () => {
  throw new Error("site login must not be imported");
});
import { getMcpProfile, listMcpProfiles } from "@/lib/mcpProfiles";
const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  allowedProfileIds: ["one", "two"],
};
const preset = {
  id: "one",
  name: "名古屋",
  birthDate: "1990-05-15T12:34",
  baseLat: 35.18,
  baseLon: 136.91,
  birthLat: 34,
  birthLon: 135,
  encryptedGeminiKey: "secret-marker",
  baseLabel: "private-place",
  baselineHrvMean: 40,
};
function row(presets: unknown = [preset], config: unknown = {}) {
  findFirst.mockResolvedValue({
    presets,
    metaphysical_config: config,
    updated_at: new Date("2026-10-11T00:00:00Z"),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  row();
});
describe("MCP selected cloud profiles (no entry point)", () => {
  it("queries only owner and necessary columns; projects minimum list", async () => {
    const value = await listMcpProfiles(context);
    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { user_id: context.userId },
      select: { presets: true, metaphysical_config: true, updated_at: true },
    });
    expect(value).toEqual({
      profiles: [
        {
          id: "one",
          name: "名古屋",
          active: null,
          readyForCalculation: true,
          missingFields: [],
        },
      ],
      storage: "cloud",
      configUpdatedAt: "2026-10-11T00:00:00.000Z",
    });
  });
  it("does not share new IDs or leak unselected duplicate names", async () => {
    row([preset, { ...preset, id: "new" }]);
    expect((await listMcpProfiles(context)).profiles).toHaveLength(1);
    expect(
      (await getMcpProfile(context, { profile: { name: "名古屋" } })).profile
        .id,
    ).toBe("one");
    await expect(
      getMcpProfile(context, { profile: { id: "new" } }),
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND" });
  });
  it("returns only allowed id/name ambiguity candidates", async () => {
    row([preset, { ...preset, id: "two" }, { ...preset, id: "hidden" }]);
    await expect(
      getMcpProfile(context, { profile: { name: "名古屋" } }),
    ).rejects.toMatchObject({
      code: "AMBIGUOUS_PROFILE",
      candidates: [
        { id: "one", name: "名古屋" },
        { id: "two", name: "名古屋" },
      ],
    });
  });
  it("requires literal true to return only calculation inputs", async () => {
    const normal = await getMcpProfile(context, { profile: { id: "one" } });
    for (const secret of [
      preset.birthDate,
      "136.91",
      "secret-marker",
      "private-place",
      "birthLat",
      "baselineHrvMean",
    ])
      expect(JSON.stringify(normal)).not.toContain(secret);
    expect(normal).not.toHaveProperty("calculationInputs");
    const explicit = await getMcpProfile(context, {
      profile: { id: "one" },
      includeCalculationInputs: true,
    });
    expect(explicit.calculationInputs).toEqual({
      birthDate: preset.birthDate,
      lat: preset.baseLat,
      lon: preset.baseLon,
    });
    expect(JSON.stringify(explicit)).not.toContain("secret-marker");
    await expect(
      getMcpProfile(context, {
        profile: { id: "one" },
        includeCalculationInputs: "true",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it.each([null, []])(
    "empty/uninitialized storage has no fallback %j",
    async (presets) => {
      row(presets);
      expect((await listMcpProfiles(context)).profiles).toEqual([]);
    },
  );
  it("missing owner row remains empty", async () => {
    findFirst.mockResolvedValue(null);
    expect((await listMcpProfiles(context)).profiles).toEqual([]);
  });
  it.each([{}, { id: "one", name: "名古屋" }, { name: "名古" }])(
    "rejects invalid/nonexact selectors %j",
    async (profile) => {
      await expect(getMcpProfile(context, { profile })).rejects.toBeInstanceOf(
        Error,
      );
    },
  );
  it.each(["dev-bypass-id", "", "user@example.test"])(
    "invalid subjects never query DB %s",
    async (userId) => {
      await expect(
        listMcpProfiles({ ...context, userId }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it.each([
    { birthDate: "1990-02-30" },
    { baseLon: null },
    { birthLat: undefined },
    { baseLat: 90 },
  ])(
    "marks invalid inputs incomplete without substitution %j",
    async (patch) => {
      row([{ ...preset, ...patch }]);
      expect(
        (await listMcpProfiles(context)).profiles[0].readyForCalculation,
      ).toBe(false);
      expect(
        (await getMcpProfile(context, { profile: { id: "one" } }))
          .readyForCalculation,
      ).toBe(false);
      await expect(
        getMcpProfile(context, {
          profile: { id: "one" },
          includeCalculationInputs: true,
        }),
      ).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" });
    },
  );
  it.each([
    { use_classical_board: false },
    { zodiac_time_basis: "unknown" },
    { action_intent: "REST" },
    { unknown: true },
  ])("rejects unsupported account settings %j", async (config) => {
    row([preset], config);
    expect(
      (await listMcpProfiles(context)).profiles[0].missingFields,
    ).toContain("settings");
    await expect(
      getMcpProfile(context, { profile: { id: "one" } }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SETTINGS" });
  });
  it.each([
    { engineType: "physical" },
    { layerMode: "year" },
    { voidZodiacOverride: "bad" },
  ])("rejects unsupported preset settings %j", async (patch) => {
    row([{ ...preset, ...patch }]);
    await expect(
      getMcpProfile(context, { profile: { id: "one" } }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SETTINGS" });
  });
  it("reports setting sources and does not apply device targetDate", async () => {
    row([{ ...preset, voidZodiacOverride: "辰巳", targetDate: "2020-01-01" }], {
      use_classical_board: true,
      zodiac_time_basis: "solar",
      direction_filter_mode: "environmental",
    });
    const result = await getMcpProfile(context, { profile: { id: "one" } });
    expect(result.settingsSources).toEqual({
      useClassicalBoard: "account",
      voidZodiacOverride: "preset",
      zodiacTimeBasis: "account",
      directionFilterMode: "account",
    });
    expect(result.settings).toEqual({
      useClassicalBoard: true,
      voidZodiacOverride: "辰巳",
      zodiacTimeBasis: "solar",
      directionFilterMode: "environmental",
    });
    expect(JSON.stringify(result)).not.toContain("2020-01-01");
  });
  it.each([
    { value: [preset, preset] },
    { value: Array(101).fill(preset) },
    { value: { bad: true } },
    { value: [{ name: "bad" }] },
  ])("rejects corrupt/oversized storage", async ({ value }) => {
    row(value);
    await expect(listMcpProfiles(context)).rejects.toMatchObject({
      code: "PROFILE_INCOMPLETE",
    });
  });
  it("sanitizes DB failures and never logs raw values", async () => {
    const log = vi.spyOn(console, "error");
    findFirst.mockRejectedValue(new Error("secret-marker 1990-05-15"));
    await expect(listMcpProfiles(context)).rejects.toMatchObject({
      message: "TEMPORARILY_UNAVAILABLE",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
