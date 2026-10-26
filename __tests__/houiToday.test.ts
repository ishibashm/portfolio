import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dayDirectionsByStar,
  shiftJstDate,
  timeSlotsByStar,
  formatJpDate,
} from "@/lib/todayDirections";
import { CORE_ROUTES } from "@/lib/siteStructure";

describe("todayDirections", () => {
  it("9 星ぶん返し、吉と凶が重ならない", () => {
    const rows = dayDirectionsByStar("2026-10-26");
    expect(rows.map((r) => r.star)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const r of rows) {
      const good = new Set(r.good.map((g) => g.dir));
      expect(r.bad.some((b) => good.has(b.dir))).toBe(false);
    }
  });

  it("五黄殺・暗剣殺は全員の凶方位として同じ方位に出る", () => {
    const rows = dayDirectionsByStar("2026-10-26");
    const pick = (label: string) =>
      rows.map((r) => r.bad.find((b) => b.label === label)?.dir ?? null);
    for (const label of ["五黄殺", "暗剣殺"]) {
      const dirs = pick(label).filter((d) => d !== null);
      // 五黄が中宮の日は出ない。出るなら全員同じ方位
      expect(new Set(dirs).size).toBeLessThanOrEqual(1);
    }
  });

  it("刻は 12 個で 9 星ぶんの可否を持つ", () => {
    const slots = timeSlotsByStar("2026-10-26");
    expect(slots).toHaveLength(12);
    for (const s of slots) {
      expect(Object.keys(s.favorable)).toHaveLength(9);
      expect(s.start).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("日付の繰り上げと表記（JST）", () => {
    expect(shiftJstDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(formatJpDate("2026-10-26")).toBe("2026年10月26日（月）");
  });
});

describe("/houi/today の配線", () => {
  it("ナビ（CORE_ROUTES）に載る", () => {
    expect(CORE_ROUTES.some((r) => r.href === "/houi/today")).toBe(true);
  });
  it("トップから辿れる", () => {
    expect(readFileSync("src/app/page.tsx", "utf8")).toMatch(/"\/houi\/today"/);
  });
  it("ページは暦エンジンを client に配らない（use client なし・ISR）", () => {
    const src = readFileSync("src/app/houi/today/page.tsx", "utf8");
    expect(src).not.toMatch(/"use client"/);
    expect(src).toMatch(/export const revalidate = \d+/);
    const tabs = readFileSync("src/components/houi/TodayStarTabs.tsx", "utf8");
    expect(tabs).not.toMatch(
      /^import (?!type)[^\n]*(todayDirections|ephemeris|lunar|auspiciousDays)/m,
    );
  });
  it("サイトマップから除外されていない", () => {
    const cfg = readFileSync("next-sitemap.config.js", "utf8");
    expect(cfg).not.toMatch(/["']\/houi\/today["']/);
  });
});
