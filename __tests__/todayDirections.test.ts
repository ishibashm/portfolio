import { describe, expect, it } from "vitest";
import {
  buildTodayDirections,
  buildCurrentDirections,
  additionalUnlucky,
  nextLuckyHour,
} from "@/lib/todayDirections";
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

it("共通凶を方位キーで除き、異なる個人の理由は残す", () => {
  expect(
    additionalUnlucky(
      [
        { direction: "E", status: "NOISE_TEKI" },
        { direction: "N", status: "NOISE_ANKEN" },
        { direction: "W", status: "NOISE_HA" },
      ],
      [
        { direction: "E", status: "NOISE_GOU" },
        { direction: "N", status: "NOISE_GOU" },
        { direction: "W", status: "NOISE_HA" },
      ],
    ),
  ).toEqual(["東（本命的殺）"]);
});
it("12刻それぞれの共通凶を除く（日盤だけで差し引かない）", () => {
  const data = buildTodayDirections(new Date("2026-11-19T12:00:00+09:00"));
  const commonSets = new Set<string>();
  for (const hour of data.stars[0].hours) {
    const current = buildCurrentDirections(
      new Date(new Date(hour.start).getTime() + 60000),
    );
    // 前日開始の子の刻以外は、日盤も現在の刻も一致する。
    if (current.date !== data.date) continue;
    expect(hour.common.unlucky).toEqual(current.unlucky);
    commonSets.add(hour.common.unlucky.join());
    expect(additionalUnlucky(hour.common.keyed, hour.common.keyed)).toEqual([]);
    for (const star of data.stars) {
      const personal = star.hours.find((item) => item.branch === hour.branch)!;
      expect(
        additionalUnlucky(personal.keyed, hour.common.keyed).every(
          (item) => !/五黄殺|暗剣殺|日破/.test(item),
        ),
      ).toBe(true);
    }
  }
  expect(commonSets.size).toBeGreaterThan(1);
});
it("次の吉は当日内の未来の刻から選び、夜は翌日に借りない", () => {
  const now = new Date("2026-11-19T08:00:00+09:00");
  const data = buildTodayDirections(now);
  for (const star of data.stars) {
    const expected =
      [...star.hours, ...star.lateHours].filter(
        (h) => new Date(h.start) > now && h.lucky.length,
      )[0] ?? null;
    expect(nextLuckyHour(data, star.star, now)).toEqual(expected);
    expect(
      nextLuckyHour(data, star.star, new Date("2026-11-19T23:59:00+09:00")),
    ).toBeNull();
  }
  expect(data.stars.some((star) => nextLuckyHour(data, star.star, now))).toBe(
    true,
  );
});

it("夜に始まる子の刻も当日内の次の候補に含める", () => {
  const now = new Date("2026-11-19T22:00:00+09:00");
  const data = buildTodayDirections(now);
  for (const star of data.stars) {
    expect(star.hours).toHaveLength(12);
    expect(star.lateHours).toHaveLength(1);
    const late = star.lateHours[0];
    expect(nextLuckyHour(data, star.star, now)).toEqual(
      late.lucky.length ? late : null,
    );
  }
});
