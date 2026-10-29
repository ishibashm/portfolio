import { describe, expect, it } from "vitest";
import { buildTodayDirections } from "@/lib/todayDirections";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalDayStar,
} from "@/utils/ephemerisEngine";
import { DIRECTIONS, DIRECTION_LABELS } from "@/lib/kigakuContent";
import { getDailySolarSchedule } from "@/utils/solarTime";

describe("今日の公開方位", () => {
  it("JSTの年越しで今日・明日を切り替える", () => {
    const before = buildTodayDirections(new Date("2026-12-31T14:59:59Z"));
    const after = buildTodayDirections(new Date("2026-12-31T15:00:00Z"));
    expect([before.date, before.tomorrow]).toEqual([
      "2026-12-31",
      "2027-01-01",
    ]);
    expect([after.date, after.tomorrow]).toEqual(["2027-01-01", "2027-01-02"]);
    expect(before.stars.map((s) => s.tomorrow)).toEqual(
      after.stars.map((s) => s.today),
    );
  });

  it.each(["2026-01-15", "2026-06-21", "2026-10-26"])(
    "%s の全9星で日盤の凶を時間帯でも守る",
    (ymd) => {
      const date = new Date(`${ymd}T12:00:00+09:00`);
      const data = buildTodayDirections(date);
      const board = generateBoard(getClassicalDayStar(date));
      const schedule = getDailySolarSchedule(date, 139.6917, 9);
      expect(data.stars).toHaveLength(9);
      for (const star of data.stars) {
        const daily = calculateVectorCollision(
          star.star,
          board,
          board,
          board,
          [],
          "DEFAULT",
          date,
        ).dayLayer;
        expect(star.today.lucky).toEqual(
          DIRECTIONS.filter((d) => daily[d]?.startsWith("OPTIMAL")).map(
            (d) => DIRECTION_LABELS[d],
          ),
        );
        expect(star.hours).toHaveLength(12);
        expect(star.hours.map((h) => h.center)).toEqual(
          schedule.map((s) => s.kyusei.japanese),
        );
        expect(new Set(star.hours.map((h) => h.branch)).size).toBe(12);
        for (const d of DIRECTIONS.filter((d) =>
          daily[d]?.startsWith("NOISE_"),
        )) {
          expect(
            star.today.unlucky.some((label) =>
              label.startsWith(`${DIRECTION_LABELS[d]}（`),
            ),
          ).toBe(true);
          for (const hour of star.hours) {
            expect(hour.lucky).not.toContain(DIRECTION_LABELS[d]);
            expect(
              hour.unlucky.some((label) =>
                label.startsWith(`${DIRECTION_LABELS[d]}（`),
              ),
            ).toBe(true);
          }
        }
      }
      // Universal hazards must never depend on which personal star was selected.
      for (const hazard of ["五黄殺", "暗剣殺", "日破"]) {
        const reference = data.stars[0].today.unlucky.filter((s) =>
          s.includes(hazard),
        );
        for (const star of data.stars)
          expect(star.today.unlucky.filter((s) => s.includes(hazard))).toEqual(
            reference,
          );
      }
    },
  );
});
