import { describe, expect, it } from "vitest";
import { calculateTenchusatsu } from "@/utils/tenchusatsu";
import {
  dayCycleIndex,
  nextVoidYears,
  tenchusatsuForBirthDate,
  yearBranch,
} from "@/lib/tenchusatsuLite";
import { monthBranches, timelineByGroup } from "@/lib/tenchusatsuTimeline";

describe("tenchusatsuLite は暦エンジン版と一致する", () => {
  it("1930〜2025 年の多数の日付で天中殺グループと日柱が一致", () => {
    for (let y = 1930; y <= 2025; y += 1) {
      for (const [m, d] of [
        [1, 1],
        [2, 3],
        [2, 4],
        [6, 15],
        [12, 31],
      ]) {
        const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const ref = calculateTenchusatsu(new Date(`${ymd}T12:00:00+09:00`));
        const lite = tenchusatsuForBirthDate(ymd)!;
        expect(lite.group, ymd).toBe(ref.tenchusatsu.name);
        expect(lite.ganZhi, ymd).toBe(ref.ganZhi);
      }
    }
  });

  it("不正な日付は null", () => {
    expect(dayCycleIndex("2026-02-30")).toBeNull();
    expect(tenchusatsuForBirthDate("abc")).toBeNull();
  });

  it("年の支と天中殺の年", () => {
    expect(yearBranch(2026)).toBe("午");
    expect(nextVoidYears("午未", 2026)).toEqual([2026, 2027]);
    expect(nextVoidYears("午未", 2027)).toEqual([2026, 2027]);
    expect(nextVoidYears("申酉", 2026)).toEqual([2028, 2029]);
    expect(nextVoidYears("子丑", 2026)).toEqual([2032, 2033]);
  });
});

describe("tenchusatsuTimeline", () => {
  it("月の支は 12 か月で一巡し、寅月は 2 月", () => {
    const ms = monthBranches(2026, 1, 12);
    expect(ms.find((m) => m.month === 2)!.monthBranch).toBe("寅");
    expect(new Set(ms.map((m) => m.monthBranch)).size).toBe(12);
    const tl = timelineByGroup(ms);
    // どのグループも 1 年に天中殺の月はちょうど 2 か月
    for (const g of Object.values(tl)) {
      expect(g.filter((x) => x.monthVoid)).toHaveLength(2);
    }
    // 2026 年（午年）は午未グループが年天中殺
    expect(tl["午未"][6].yearVoid).toBe(true);
  });
});
