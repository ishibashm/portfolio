import { describe, expect, it } from "vitest";
import spotFile from "@/data/powerSpots.json";
import { AREAS } from "@/lib/areaContent";
import {
  buildKichihouiPlan,
  googleCalendarUrl,
  parsePlannerQuery,
  plannerHref,
  spreadPick,
  type PlannerSpotInput,
} from "@/lib/kichihouiPlanner";
import { findPurposeDaysAllDirections } from "@/utils/auspiciousDays";
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
    ).toEqual({ star: 9, purpose: "short_stay", weeks: 12, from: "nagoya" });
  });
  it("不正な値はエラーにせず既定に落とす", () => {
    expect(
      parsePlannerQuery({
        star: "10",
        purpose: "relocation",
        weeks: "5",
        from: ["a", "b"],
      }),
    ).toEqual({ star: null, purpose: "daytrip", weeks: 8, from: undefined });
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
