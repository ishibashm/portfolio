// @vitest-environment node
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/relocationWindows.golden.json";
import { findRelocationWindows } from "@/lib/relocationWindows";
import { buildBase, calculateMcpDirections } from "@/lib/mcpDirections";
import { TENCHUSATSU_WEAK_NOTE } from "@/utils/tenchusatsuPolicy";

function scan(mode = "weaken") {
  const result = findRelocationWindows({ ...fixture.input, tenchusatsuMode: mode });
  if (!result.ok) throw new Error(result.error);
  return result.payload;
}
const tiers = (directions: { label: string; tier: string }[]) =>
  Object.fromEntries(directions.map((d) => [d.label, d.tier]));

describe("fictional relocation golden fixture", () => {
  it("has classical 三碧木星 and 午未 void zodiacs (甲申旬)", () => {
    const built = buildBase(fixture.input);
    if (!built.ok) throw new Error(built.error);
    expect(built.honmei.classical).toBe(3);
    expect(built.voidZodiacs).toEqual(["午", "未"]);
  });

  it("matches every frozen window and totals", () => {
    const p = scan();
    expect(p.windows.map((w) => ({
      from: w.from, to: w.to, directions: tiers(w.directions),
      allDirectionsBad: w.allDirectionsBad,
      tenchusatsuScopes: w.tenchusatsu.scopes,
    }))).toEqual(fixture.windows);
    expect(p.tripleDaysTotal).toBe(fixture.tripleDaysTotal);
    expect(p.summary.allDirectionsBadDays).toBe(fixture.allDirectionsBadDays);
  });

  it.each([
    ["2027-01-06", "2027-02-03", ["year"], true],
    ["2027-07-08", "2027-08-07", ["year", "month"], false],
    ["2027-08-08", "2027-09-07", ["year"], false],
    ["2028-02-05", "2028-03-04", [], false],
  ] as const)("preserves known period %s–%s", (from, to, scopes, allDirectionsBad) => {
    const w = scan().windows.find((w) => w.from === from);
    expect(w).toBeDefined();
    expect(w?.to).toBe(to);
    expect(w?.allDirectionsBad).toBe(allDirectionsBad);
    expect(w?.tenchusatsu.scopes).toEqual(scopes);
    if (from.startsWith("2027-0") && !allDirectionsBad)
      expect(tiers(w!.directions)["北西"]).toBe("S");
  });

  it("matches independent daily relocation calculations throughout 600 days", () => {
    const p = scan();
    for (let i = 0; i < 20; i++) {
      const date = new Date(Date.parse(`${fixture.input.from}T12:00:00+09:00`) +
        Math.round(i * 599 / 19) * 86400000).toISOString().slice(0, 10);
      const daily = calculateMcpDirections({ ...fixture.input, date, purpose: "relocation" });
      if (!daily.ok) throw new Error(daily.error);
      const w = p.windows.find((w) => w.from <= date && date <= w.to)!;
      expect(tiers(w.directions), date).toEqual(tiers(daily.payload.directions.filter((d) => d.tier !== "X")));
      expect(w.tenchusatsu.scopes, date).toEqual(daily.payload.tenchusatsu.scopes);
    }
  });

  it("weakens scoped windows by default and blocks them in strict mode", () => {
    for (const mode of ["weaken", "strict"]) {
      const windows = scan(mode).windows.filter((w) => w.tenchusatsu.scopes.length);
      expect(windows.length).toBeGreaterThan(0);
      for (const w of windows) {
        expect(w.tenchusatsu.scopes.every((s) => s === "year" || s === "month")).toBe(true);
        expect(w.tenchusatsu.blocks).toBe(mode === "strict");
        if (mode === "weaken") expect(w.tenchusatsu.note).toBe(TENCHUSATSU_WEAK_NOTE);
      }
    }
  });
});
