// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findRelocationWindows } from "@/lib/relocationWindows";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import { TENCHUSATSU_WEAK_NOTE } from "@/utils/tenchusatsuPolicy";

const input = {
  birthDate: "1990-05-15",
  lon: 139.69,
  from: "2026-01-01",
  days: 730,
};
function scan(args = input) {
  const r = findRelocationWindows(args);
  if (!r.ok) throw new Error(r.error);
  return r.payload;
}
const nextDay = (date: string, offset = 1) =>
  new Date(new Date(`${date}T12:00:00+09:00`).getTime() + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const signature = (w: ReturnType<typeof scan>["windows"][number]) =>
  JSON.stringify([w.directions, w.tenchusatsu]);

describe("relocation windows", () => {
  it("scans 730 days in reasonable time, covers and maximally merges every day", () => {
    const start = performance.now();
    const p = scan();
    const elapsed = performance.now() - start;
    console.info(`relocation 730-day scan: ${Math.round(elapsed)}ms`);
    expect(elapsed).toBeLessThan(15000);
    expect(p.windows[0].from).toBe(input.from);
    expect(p.to).toBe(nextDay(input.from, 729));
    expect(p.windows.reduce((n, w) => n + w.days, 0)).toBe(730);
    p.windows.forEach((w, i) => {
      expect(nextDay(w.from, w.days - 1)).toBe(w.to);
      expect(w.allDirectionsBad).toBe(w.directions.length === 0);
      expect(w.directions.every((d) => d.tier !== "X")).toBe(true);
      if (i) {
        expect(w.from).toBe(nextDay(p.windows[i - 1].to));
        expect(signature(w)).not.toBe(signature(p.windows[i - 1]));
      }
    });
    expect(p.summary.windowsCount).toBe(p.windows.length);
    expect(p.summary.bestWindows.every((w) => w.bestTier === "S")).toBe(true);
    expect(p.summary.allDirectionsBadDays).toBe(
      p.windows
        .filter((w) => w.allDirectionsBad)
        .reduce((n, w) => n + w.days, 0),
    );
    expect(p.tripleDays.length).toBeLessThanOrEqual(200);
  }, 20000);
  it.each(["1990-05-15", "1975-02-03"])(
    "matches judge_directions for %s including scopes and triples",
    (birthDate) => {
      const args = { ...input, birthDate, days: 60 };
      const p = scan(args);
      for (let i = 0; i < 60; i += 3) {
        const date = nextDay(args.from, i);
        const r = calculateMcpDirections({
          ...args,
          date,
          purpose: "relocation",
        });
        if (!r.ok) throw new Error(r.error);
        const w = p.windows.find((w) => w.from <= date && w.to >= date)!;
        expect(w.tenchusatsu).toEqual(r.payload.tenchusatsu);
        expect(w.directions.map((d) => [d.direction, d.tier]).sort()).toEqual(
          r.payload.directions
            .filter((d) => d.tier !== "X")
            .map((d) => [d.direction, d.tier])
            .sort(),
        );
        expect(
          p.tripleDays
            .find((d) => d.date === date)
            ?.directions.map((d) => d.direction) ?? [],
        ).toEqual(
          r.payload.directions
            .filter((d) => d.tier === "S" && d.isTripleAuspicious)
            .map((d) => d.direction),
        );
        expect(w.tenchusatsu.scopes).not.toContain("day");
      }
    },
  );
  it("weakens by default, strict blocks the same scopes, involuntary does not block", () => {
    const weak = scan();
    expect(weak.summary.tenchusatsuDays).toBeGreaterThan(0);
    for (const w of weak.windows.filter((w) => w.tenchusatsu.inPeriod)) {
      expect(w.tenchusatsu.note).toBe(TENCHUSATSU_WEAK_NOTE);
      expect(w.tenchusatsu.blocks).toBe(false);
      expect(w.tenchusatsu.attenuation).toBe(0.6);
    }
    for (const involuntaryMove of [false, true]) {
      const r = findRelocationWindows({
        ...input,
        tenchusatsuMode: "strict",
        involuntaryMove,
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.payload.windows.some((w) => w.tenchusatsu.inPeriod)).toBe(true);
      for (const w of r.payload.windows)
        expect(w.tenchusatsu.blocks).toBe(
          w.tenchusatsu.inPeriod && !involuntaryMove,
        );
    }
  }, 20000);
  it.each([
    { days: 29 },
    { days: NaN },
    { days: Infinity },
    { lon: NaN },
    { lon: Infinity },
    { birthDate: "" },
    { birthDate: "1979-1-17" },
    { from: "2026-11-14T12:00:00" },
    { birthTime: "12:60" },
    { days: 731 },
    { days: 30.5 },
    { lon: 121 },
    { lon: 155 },
    { birthDate: "1990-02-30" },
    { from: "2026-02-30" },
    { birthTime: "24:00" },
    { tenchusatsuMode: "bogus" },
    { directionFilterMode: "bogus" },
  ])("rejects invalid input %j", (change) => {
    expect(findRelocationWindows({ ...input, ...change }).ok).toBe(false);
  });
  it("uses today JST and 600 days by default, accepts time, and protects cache from mutation", () => {
    const args = { birthDate: "1975-02-03", birthTime: "03:20", lon: 136.91 };
    const now = new Date("2026-01-01T16:00:00Z");
    const first = findRelocationWindows(args, now);
    const second = findRelocationWindows(args, now);
    expect(second).toEqual(first);
    if (!first.ok || !second.ok) throw new Error("scan failed");
    expect(first.payload.from).toBe("2026-01-02");
    expect(first.payload.days).toBe(600);
    first.payload.windows.length = 0;
    expect(findRelocationWindows(args, now)).toEqual(second);
    const timed = calculateMcpDirections({
      ...args,
      date: second.payload.from,
      purpose: "relocation",
    });
    if (!timed.ok) throw new Error(timed.error);
    expect(second.payload.windows[0].tenchusatsu).toEqual(
      timed.payload.tenchusatsu,
    );
  }, 20000);
});
