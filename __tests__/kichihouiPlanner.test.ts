import { describe, expect, it } from "vitest";
import spotFile from "@/data/powerSpots.json";
import { AREAS } from "@/lib/areaContent";
import {
  addJapanMonths,
  LONG_STAY_TIER_LABELS,
  buildKichihouiPlan,
  googleCalendarUrl,
  kigakuTermOf,
  termsInRange,
  parsePlannerQuery,
  plannerHref,
  spreadPick,
  tripPurposeOf,
  type PlannerSpotInput,
} from "@/lib/kichihouiPlanner";
import {
  findAuspiciousDaysAllDirections,
  findPurposeDaysAllDirections,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import { gradeForPurpose } from "@/utils/tripPurpose";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";

const TOKYO = { lat: 35.6895, lon: 139.6917, name: "東京" };
const START = new Date("2026-12-01T12:00:00+09:00");
const SPOTS = (spotFile as { spots: PlannerSpotInput[] }).spots;

describe("parsePlannerQuery", () => {
  it("既定値", () => {
    expect(parsePlannerQuery({})).toEqual({
      star: null,
      purpose: "daytrip",
      weeks: 8,
      months: 6,
      from: undefined,
    });
  });
  it("正しい値を読む", () => {
    expect(
      parsePlannerQuery({
        star: "9",
        purpose: "short_stay",
        weeks: "12",
        from: "nagoya",
      }),
    ).toEqual({
      star: 9,
      purpose: "short_stay",
      weeks: 12,
      months: 6,
      from: "nagoya",
    });
    expect(
      parsePlannerQuery({ purpose: "long_stay", months: "3", star: "3" }),
    ).toEqual({
      star: 3,
      purpose: "long_stay",
      weeks: 8,
      months: 3,
      from: undefined,
    });
  });
  it("不正な値はエラーにせず既定に落とす", () => {
    expect(
      parsePlannerQuery({
        star: "10",
        purpose: "relocation",
        weeks: "5",
        from: ["a", "b"],
      }),
    ).toEqual({
      star: null,
      purpose: "daytrip",
      weeks: 8,
      months: 6,
      from: undefined,
    });
    expect(parsePlannerQuery({ star: "0" }).star).toBeNull();
    expect(parsePlannerQuery({ star: "3x" }).star).toBeNull();
  });
});

describe("plannerHref", () => {
  it("指定したものだけ載せる", () => {
    expect(plannerHref({})).toBe("/houi/planner");
    expect(
      plannerHref({ star: 3, purpose: "daytrip", weeks: 4, from: "osaka" }),
    ).toBe("/houi/planner?star=3&purpose=daytrip&weeks=4&from=osaka");
    expect(plannerHref({ star: null, weeks: 8 })).toBe("/houi/planner?weeks=8");
  });
});

describe("googleCalendarUrl", () => {
  it("終日予定（翌日まで）で、年末も繰り上がる", () => {
    const url = new URL(
      googleCalendarUrl({
        date: "2026-12-31",
        title: "吉方位取り：南（日帰り）",
        details: "行き先の例：横浜市\nhttps://cloud-palette.com/houi/planner",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261231/20270101");
    expect(url.searchParams.get("text")).toBe("吉方位取り：南（日帰り）");
    expect(url.searchParams.get("details")).toContain("\n");
  });
  it("月末・うるう年", () => {
    const dates = (date: string) =>
      new URL(
        googleCalendarUrl({ date, title: "t", details: "d" }),
      ).searchParams.get("dates");
    expect(dates("2027-02-28")).toBe("20270228/20270301");
    expect(dates("2028-02-28")).toBe("20280228/20280229");
  });
});

describe("spreadPick", () => {
  it("近い〜遠いを等間隔に取る", () => {
    expect(spreadPick([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9]);
    expect(spreadPick([1, 2], 5)).toEqual([1, 2]);
  });
});

describe("buildKichihouiPlan", () => {
  for (const purpose of ["daytrip", "short_stay"] as const) {
    const plan = buildKichihouiPlan({
      star: 3,
      purpose,
      origin: TOKYO,
      start: START,
      weeks: 4,
      areas: AREAS,
      spots: SPOTS,
    });

    it(`${purpose}: 日付は既存の判定（findPurposeDaysAllDirections）のまま`, () => {
      const end = new Date(START.getTime() + 27 * 24 * 60 * 60 * 1000);
      const expected = findPurposeDaysAllDirections(
        START,
        end,
        {
          honmeiStar: 3,
          voidZodiacs: [],
          lon: TOKYO.lon,
          tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
          involuntaryMove: false,
        },
        purpose,
      );
      expect(plan.directions).toHaveLength(8);
      for (const d of plan.directions) {
        const e = expected.find((x) => x.direction === d.direction)!;
        const available = e.days.filter((x) => !x.blockedByTenchusatsu);
        expect(d.totalAvailable).toBe(available.length);
        expect(d.days.map((x) => x.date)).toEqual(
          available.slice(0, 6).map((x) => x.date),
        );
        expect(d.nextDate).toBe(available[0]?.date ?? null);
      }
      expect(plan.from).toBe("2026-12-01");
      expect(plan.to).toBe("2026-12-28");
      expect(plan.usesTenchusatsu).toBe(false);
    });

    it(`${purpose}: 行き先は 5〜150km で、その方位に入っている`, () => {
      for (const d of plan.directions) {
        expect(d.destinations.length).toBeLessThanOrEqual(5);
        for (const x of d.destinations) {
          const area = AREAS.find((a) => a.code === x.code)!;
          const km = distanceKmBetween(
            TOKYO.lat,
            TOKYO.lon,
            area.lat,
            area.lon,
          );
          expect(km).toBeGreaterThanOrEqual(5);
          expect(km).toBeLessThanOrEqual(150);
          expect(
            directionFromBearing(
              bearingBetween(TOKYO.lat, TOKYO.lon, area.lat, area.lon),
              "traditional",
            ),
          ).toBe(d.direction);
        }
        for (const s of d.spots) {
          const spot = SPOTS.find((p) => p.id === s.id)!;
          expect(s.distanceKm).toBeLessThanOrEqual(300);
          expect(
            directionFromBearing(
              bearingBetween(TOKYO.lat, TOKYO.lon, spot.lat, spot.lon),
              "traditional",
            ),
          ).toBe(d.direction);
        }
      }
    });

    it(`${purpose}: 早い日の方位から並び、0 件の方位は後ろ`, () => {
      const dates = plan.directions.map((d) => d.nextDate);
      const firstNull = dates.indexOf(null);
      const withDate = (
        firstNull === -1 ? dates : dates.slice(0, firstNull)
      ) as string[];
      expect([...withDate].sort()).toEqual(withDate);
      if (firstNull !== -1)
        expect(dates.slice(firstNull).every((x) => x === null)).toBe(true);
      const min = withDate[0] ?? null;
      expect(plan.soonest?.date ?? null).toBe(min);
    });
  }
});

describe("addJapanMonths / kigakuTermOf", () => {
  it("同じ日の N か月後（月末は先の月の末日）", () => {
    const d = (s: string, months: number) =>
      addJapanMonths(new Date(`${s}T12:00:00+09:00`), months)
        .toISOString()
        .slice(0, 10);
    expect(d("2026-11-26", 3)).toBe("2027-02-26");
    expect(d("2026-11-26", 12)).toBe("2027-11-26");
    expect(d("2027-01-31", 1)).toBe("2027-02-28");
    expect(d("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("節入り月は kigakuMonthRange の期間に入る", () => {
    const t = kigakuTermOf("2026-12-01");
    expect(t.start <= "2026-12-01").toBe(true);
    expect(t.end >= "2026-12-01").toBe(true);
    expect(kigakuTermOf(t.start).month).toBe(t.month);
    expect(kigakuTermOf(t.end).month).toBe(t.month);
  });
});

describe("buildKichihouiPlan long_stay", () => {
  const plan = buildKichihouiPlan({
    star: 9,
    purpose: "long_stay",
    origin: TOKYO,
    start: START,
    months: 3,
    areas: AREAS,
    spots: SPOTS,
  });
  const end = addJapanMonths(START, 3);
  const base = {
    honmeiStar: 9 as const,
    voidZodiacs: [],
    lon: TOKYO.lon,
    tenchusatsuMode: "weaken" as const,
    involuntaryMove: false,
  };

  it("日は既存の relocation（年盤＋月盤）判定のまま", () => {
    expect(tripPurposeOf("long_stay")).toBe("relocation");
    const expected = findPurposeDaysAllDirections(
      START,
      end,
      base,
      "relocation",
    );
    expect(plan.boardsUsed).toEqual(["year", "month"]);
    expect(plan.from).toBe("2026-12-01");
    expect(plan.to).toBe("2027-03-01");
    expect(plan.directions).toHaveLength(8);
    for (const d of plan.directions) {
      const e = expected.find((x) => x.direction === d.direction)!;
      const available = e.days.filter((x) => !x.blockedByTenchusatsu);
      expect(d.totalAvailable).toBe(available.length);
      expect(d.days.map((x) => x.date)).toEqual(
        available.slice(0, 6).map((x) => x.date),
      );
      expect(d.yearBoardValidUntil).toBe(e.window?.yearBoardValidUntil ?? null);
    }
  });

  it("おすすめの出発日は三盤吉と一致する", () => {
    const triple = findAuspiciousDaysAllDirections(START, end, base, "triple");
    for (const d of plan.directions) {
      const e = triple.find((x) => x.direction === d.direction)!;
      const dates = e.days
        .filter((x) => !x.blockedByTenchusatsu)
        .map((x) => x.date);
      expect(d.departureDays.map((x) => x.date)).toEqual(dates.slice(0, 6));
      const fromTerms = d.terms.flatMap((t) =>
        t.departureDays.map((x) => x.date),
      );
      for (const date of fromTerms) expect(dates).toContain(date);
      // 各節は最大 6 件。期間全体の先頭 6 件は、属する節に必ず含まれる。
      for (const date of dates.slice(0, 6)) expect(fromTerms).toContain(date);
    }
  });

  it("節入り月のまとめに、その方位の吉の日が過不足なく入る", () => {
    for (const d of plan.directions) {
      expect(d.terms.reduce((n, t) => n + t.available, 0)).toBe(
        d.totalAvailable,
      );
      for (const t of d.terms) {
        expect(t.start <= t.end).toBe(true);
        for (const day of t.days) {
          expect(day.date >= t.start && day.date <= t.end).toBe(true);
          expect(kigakuTermOf(day.date).month).toBe(t.month);
        }
        const term = kigakuTermOf(t.start);
        expect(term.start).toBe(t.start);
        expect(term.end).toBe(t.end);
      }
      const starts = d.terms.map((t) => t.start);
      expect([...starts].sort()).toEqual(starts);
    }
  });

  it("soonest の三盤吉は全方位の最小出発日", () => {
    const dates = plan.directions.flatMap((d) =>
      d.departureDays.map((x) => x.date),
    );
    const min = dates.length ? dates.slice().sort()[0] : null;
    if (min) {
      expect(plan.soonest?.triple).toBe(true);
      expect(plan.soonest?.date).toBe(min);
    } else {
      expect(plan.soonest?.triple ?? false).toBe(false);
      expect(plan.soonest?.date ?? null).toBe(
        plan.directions.find((d) => d.nextDate)?.nextDate ?? null,
      );
    }
  });

  it("行き先は 5〜150km で、その方位に入っている", () => {
    for (const d of plan.directions) {
      for (const x of d.destinations) {
        const area = AREAS.find((a) => a.code === x.code)!;
        const km = distanceKmBetween(TOKYO.lat, TOKYO.lon, area.lat, area.lon);
        expect(km).toBeGreaterThanOrEqual(5);
        expect(km).toBeLessThanOrEqual(150);
        expect(
          directionFromBearing(
            bearingBetween(TOKYO.lat, TOKYO.lon, area.lat, area.lon),
            "traditional",
          ),
        ).toBe(d.direction);
      }
    }
  });
});

describe("buildKichihouiPlan long_stay 月ごとの段階（吉の日が 0 でも出す）", () => {
  const plan = buildKichihouiPlan({
    star: 3,
    purpose: "long_stay",
    origin: TOKYO,
    start: START,
    months: 6,
    areas: AREAS,
    spots: SPOTS,
  });
  it("三碧でも節入り月の段階は出る（判定は gradeForPurpose のまま）", () => {
    expect(plan.directions[0].terms.length).toBeGreaterThan(4);
    expect(
      plan.directions.every(
        (d) => d.terms.length === plan.directions[0].terms.length,
      ),
    ).toBe(true);
    const from = "2026-12-01";
    const to = plan.to;
    expect(plan.directions[0].terms.map((t) => t.start)).toEqual(
      termsInRange(from, to).map((t) => t.start),
    );
    const base = {
      honmeiStar: 3 as const,
      voidZodiacs: [],
      lon: TOKYO.lon,
      tenchusatsuMode: "weaken" as const,
      involuntaryMove: false,
    };
    for (const d of plan.directions) {
      for (const t of d.terms) {
        const rep = t.start < from ? from : t.start;
        const [y, m, day] = rep.split("-").map(Number);
        const v = judgeDayAllDirections(
          new Date(Date.UTC(y, m - 1, day, 3)),
          base,
        )[d.direction];
        expect(t.tier).toBe(gradeForPurpose(v, "relocation"));
        expect(t.yearStatus).toBe(v.yearLayer);
        expect(t.monthStatus).toBe(v.monthLayer);
      }
    }
  });
  it("LONG_STAY_TIER_LABELS の S は三盤吉と呼ばない", () => {
    expect(LONG_STAY_TIER_LABELS.S).toBe("年盤・月盤とも吉");
    expect(LONG_STAY_TIER_LABELS.S).not.toContain("三盤");
  });
});
