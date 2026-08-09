import { describe, expect, it } from "vitest";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";
import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";

describe("月別の引越しカレンダー", () => {
  it("その月の日数ぶんの行を作る", () => {
    expect(buildMonthlyCalendar(2026, 9).days).toHaveLength(30);
    expect(buildMonthlyCalendar(2026, 8).days).toHaveLength(31);
    expect(buildMonthlyCalendar(2028, 2).days).toHaveLength(29); // 閏年
    expect(buildMonthlyCalendar(2027, 2).days).toHaveLength(28);
  });

  it("六曜にローマ字を混ぜない", () => {
    // ROKUYO は "大安 (Taian)" の形で持っている。記事に出すのは日本語だけ。
    for (const d of buildMonthlyCalendar(2026, 9).days) {
      expect(d.rokuyo, d.date).not.toMatch(/[A-Za-z]/);
      expect(["大安", "赤口", "先勝", "友引", "先負", "仏滅"]).toContain(
        d.rokuyo,
      );
    }
  });

  it("仏滅と赤口を「向く日」に入れない", () => {
    // 一粒万倍日だけを条件にすると仏滅の日が混ざる（実測で 2026-09-19）。
    for (const [y, m] of [
      [2026, 8],
      [2026, 9],
      [2026, 10],
      [2027, 3],
    ] as const) {
      for (const d of buildMonthlyCalendar(y, m).recommended) {
        expect(["仏滅", "赤口"], `${y}-${m} ${d.date}`).not.toContain(d.rokuyo);
      }
    }
  });

  it("土用は間日を除いて「向く日」から外す", () => {
    for (const [y, m] of [
      [2026, 8],
      [2026, 10],
      [2027, 1],
    ] as const) {
      const cal = buildMonthlyCalendar(y, m);
      for (const d of cal.recommended) {
        if (d.inDoyou) expect(d.isMabi, `${d.date}`).toBe(true);
      }
    }
  });

  it("向く日は必ず大安か暦の吉が乗っている", () => {
    for (const d of buildMonthlyCalendar(2026, 9).recommended) {
      expect(d.rokuyo === "大安" || d.luckyLabels.length > 0, d.date).toBe(true);
    }
  });

  it("節入りの期間は暦月とずれる", () => {
    // 九星気学の月は 1 日ではなく節入りで替わる。8 月の盤は 8/8 から。
    const cal = buildMonthlyCalendar(2026, 8);
    expect(cal.termStart).toBe("2026-08-08");
    expect(cal.termEnd).toBe("2026-09-07");
  });

  it("9つの本命星すべてに方位を出す", () => {
    const cal = buildMonthlyCalendar(2026, 9);
    expect(cal.starDirections).toHaveLength(9);
    for (const s of cal.starDirections) {
      expect(s.starName.length).toBeGreaterThan(2);
      // 吉方位が無い月もあるが、避けたい方位は必ずある（五黄殺・暗剣殺）
      expect(s.bad.length).toBeGreaterThan(0);
    }
  });

  it("月が違えば中宮の星も変わる", () => {
    const a = buildMonthlyCalendar(2026, 8).centerStar;
    const b = buildMonthlyCalendar(2026, 9).centerStar;
    expect(a).not.toBe(b);
  });

  it("対象月は18か月ぶんで、重複しない", () => {
    const ms = calendarMonths(new Date("2026-08-09T12:00:00+09:00"));
    expect(ms).toHaveLength(18);
    expect(new Set(ms.map(calendarMonthSlug)).size).toBe(18);
    expect(calendarMonthSlug(ms[0])).toBe("2026-08");
    expect(calendarMonthSlug(ms[17])).toBe("2028-01");
  });

  it("年をまたいでも月番号が壊れない", () => {
    const ms = calendarMonths(new Date("2026-12-15T12:00:00+09:00"));
    expect(calendarMonthSlug(ms[0])).toBe("2026-12");
    expect(calendarMonthSlug(ms[1])).toBe("2027-01");
    for (const m of ms) {
      expect(m.month).toBeGreaterThanOrEqual(1);
      expect(m.month).toBeLessThanOrEqual(12);
    }
  });
});
