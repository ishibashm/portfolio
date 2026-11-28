import { describe, expect, it } from "vitest";
import spotFile from "@/data/powerSpots.json";
import { AREAS } from "@/lib/areaContent";
import {
  addJapanMonths,
  buildKichihouiPlan,
  cachedBuildKichihouiPlan,
  clearKichihouiPlanCache,
  termsInRange,
  type PlannerSpotInput,
} from "@/lib/kichihouiPlanner";
import {
  clearAuspiciousDayCaches,
  findAuspiciousDaysAllDirections,
  findPurposeDaysAllDirections,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";

const NAGOYA = { lat: 35.1609, lon: 136.9057, name: "名古屋" };
const SPOTS = (spotFile as { spots: PlannerSpotInput[] }).spots;

function spreadDates(startIso: string, endIso: string, count: number): Date[] {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const ms = startMs + Math.round(((endMs - startMs) * i) / (count - 1));
    out.push(new Date(ms));
  }
  return out;
}

describe("auspiciousDays caches", () => {
  const dates = spreadDates(
    "2026-11-28T12:00:00+09:00",
    "2027-11-28T12:00:00+09:00",
    20,
  );

  it("judgeDayAllDirections はキャッシュ前後で完全に一致する", () => {
    for (const honmeiStar of [1, 9] as const) {
      for (const voidZodiacs of [[], ["申", "酉"]]) {
        const params = {
          honmeiStar,
          voidZodiacs,
          lon: NAGOYA.lon,
          tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
          involuntaryMove: false,
        };
        for (const d of dates) {
          clearAuspiciousDayCaches();
          const cold = judgeDayAllDirections(d, params);
          const warm = judgeDayAllDirections(d, params);
          expect(warm).toEqual(cold);

          clearAuspiciousDayCaches();
          const coldAgain = judgeDayAllDirections(d, params);
          expect(coldAgain).toEqual(cold);
        }
      }
    }
  }, 120_000);

  it("findAuspiciousDaysAllDirections / findPurposeDaysAllDirections は cold と warm で一致する", () => {
    const from = new Date("2026-11-28T12:00:00+09:00");
    const to = addJapanMonths(from, 3);
    const params = {
      honmeiStar: 1 as const,
      voidZodiacs: ["申", "酉"],
      lon: NAGOYA.lon,
      tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
      involuntaryMove: false,
    };

    clearAuspiciousDayCaches();
    const coldAuspicious = findAuspiciousDaysAllDirections(
      from,
      to,
      params,
      "noBad",
    );
    const warmAuspicious = findAuspiciousDaysAllDirections(
      from,
      to,
      params,
      "noBad",
    );
    expect(warmAuspicious).toEqual(coldAuspicious);

    clearAuspiciousDayCaches();
    const coldPurpose = findPurposeDaysAllDirections(
      from,
      to,
      params,
      "relocation",
      "noBad",
    );
    const warmPurpose = findPurposeDaysAllDirections(
      from,
      to,
      params,
      "relocation",
      "noBad",
    );
    expect(warmPurpose).toEqual(coldPurpose);
  }, 120_000);

  it("judgeDayAllDirections は異なる本命星（1→4）で環境キャッシュを共有しても結果が一致する", () => {
    const baseParams = {
      voidZodiacs: ["申", "酉"],
      lon: NAGOYA.lon,
      tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
      involuntaryMove: false,
    };

    clearAuspiciousDayCaches();
    const expectedStar1 = dates.map((d) =>
      judgeDayAllDirections(d, { ...baseParams, honmeiStar: 1 }),
    );
    clearAuspiciousDayCaches();
    const expectedStar4 = dates.map((d) =>
      judgeDayAllDirections(d, { ...baseParams, honmeiStar: 4 }),
    );

    clearAuspiciousDayCaches();
    const sharedStar1 = dates.map((d) =>
      judgeDayAllDirections(d, { ...baseParams, honmeiStar: 1 }),
    );
    const sharedStar4 = dates.map((d) =>
      judgeDayAllDirections(d, { ...baseParams, honmeiStar: 4 }),
    );

    expect(sharedStar1).toEqual(expectedStar1);
    expect(sharedStar4).toEqual(expectedStar4);
  }, 120_000);
});

describe("cachedBuildKichihouiPlan", () => {
  it("long_stay 3か月と daytrip 4週で buildKichihouiPlan と一致し、同日別時刻で同一オブジェクトを返す", () => {
    const startMorning = new Date("2026-11-28T07:15:00+09:00");
    const startEvening = new Date("2026-11-28T21:45:00+09:00");

    // long_stay months 3
    clearAuspiciousDayCaches();
    clearKichihouiPlanCache();
    const directLong = buildKichihouiPlan({
      star: 1,
      purpose: "long_stay",
      origin: NAGOYA,
      start: startMorning,
      months: 3,
      areas: AREAS,
      spots: SPOTS,
    });

    clearAuspiciousDayCaches();
    clearKichihouiPlanCache();
    const cachedLong1 = cachedBuildKichihouiPlan({
      star: 1,
      purpose: "long_stay",
      origin: NAGOYA,
      start: startMorning,
      months: 3,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedLong1).toEqual(directLong);

    const cachedLong2 = cachedBuildKichihouiPlan({
      star: 1,
      purpose: "long_stay",
      origin: NAGOYA,
      start: startEvening,
      months: 3,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedLong2).toBe(cachedLong1);

    const cachedLongOtherStar = cachedBuildKichihouiPlan({
      star: 9,
      purpose: "long_stay",
      origin: NAGOYA,
      start: startMorning,
      months: 3,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedLongOtherStar).not.toEqual(cachedLong1);

    // daytrip weeks 4
    clearAuspiciousDayCaches();
    clearKichihouiPlanCache();
    const directDaytrip = buildKichihouiPlan({
      star: 1,
      purpose: "daytrip",
      origin: NAGOYA,
      start: startMorning,
      weeks: 4,
      areas: AREAS,
      spots: SPOTS,
    });

    clearAuspiciousDayCaches();
    clearKichihouiPlanCache();
    const cachedDaytrip1 = cachedBuildKichihouiPlan({
      star: 1,
      purpose: "daytrip",
      origin: NAGOYA,
      start: startMorning,
      weeks: 4,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedDaytrip1).toEqual(directDaytrip);

    const cachedDaytrip2 = cachedBuildKichihouiPlan({
      star: 1,
      purpose: "daytrip",
      origin: NAGOYA,
      start: startEvening,
      weeks: 4,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedDaytrip2).toBe(cachedDaytrip1);

    const cachedDaytripOtherStar = cachedBuildKichihouiPlan({
      star: 9,
      purpose: "daytrip",
      origin: NAGOYA,
      start: startMorning,
      weeks: 4,
      areas: AREAS,
      spots: SPOTS,
    });
    expect(cachedDaytripOtherStar).not.toEqual(cachedDaytrip1);
  }, 120_000);

  it("termsInRange は cold と warm で一致し、返り値の変更がキャッシュに影響しない", () => {
    clearKichihouiPlanCache();
    const cold = termsInRange("2026-11-28", "2027-05-28");
    const warm = termsInRange("2026-11-28", "2027-05-28");
    expect(warm).toEqual(cold);
    expect(warm).not.toBe(cold);

    const originalLabel = cold[0].label;
    warm[0].label = "mutated";
    warm.push({
      year: 2099,
      month: 1,
      start: "2099-01-01",
      end: "2099-01-31",
      label: "extra",
    });

    const afterMutation = termsInRange("2026-11-28", "2027-05-28");
    expect(afterMutation).toEqual(cold);
    expect(afterMutation[0].label).toBe(originalLabel);
    expect(afterMutation.length).toBe(cold.length);
  });
});
