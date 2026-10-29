import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getMonthDirections,
  getMonthlySummary,
  MONTHS,
} from "@/lib/kigakuContent";

describe("getMonthlySummary", () => {
  it("12 か月ぶんを getMonthDirections と同じ吉凶で返す", () => {
    for (const star of [1, 5, 9]) {
      const rows = getMonthlySummary(2026, star);
      expect(rows.map((r) => r.month)).toEqual(MONTHS);
      for (const row of rows) {
        const v = getMonthDirections(2026, row.month, star).verdicts;
        expect(row.good).toEqual(
          v.filter((x) => x.kind === "good").map((x) => x.jp),
        );
        expect(row.bad).toEqual(
          v.filter((x) => x.kind === "bad").map((x) => x.jp),
        );
      }
    }
  });
  it("/houi/today が 12 か月の早見表を出す", () => {
    const src = readFileSync("src/app/houi/today/page.tsx", "utf8");
    expect(src).toMatch(/getMonthlySummary\(year, star\.star\)/);
  });
});
