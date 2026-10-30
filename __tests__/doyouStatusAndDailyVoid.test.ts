import { describe, expect, it } from "vitest";
import { judgeDay } from "@/utils/auspiciousDays";
import { Solar } from "lunar-javascript";
import {
  calculateVectorCollision,
  filterCollisionByMode,
  generateBoard,
  getCurrentZodiac,
  getPersonalVoidZodiac,
  EIGHT_DIRECTIONS,
} from "@/utils/ephemerisEngine";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import { directionLabelName } from "@/lib/directionLabels";
import { getStatusScore } from "@/lib/scoreTier";
import { isFatalNoise, worstNoise } from "@/utils/noiseSeverity";

describe("土用殺専用ステータス", () => {
  it("2026-10-30の北西をMCPも土用殺として返す", () => {
    const result = calculateMcpDirections({
      birthDate: "1990-01-01",
      date: "2026-10-30",
      lon: 135,
      tenchusatsuMode: "off",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const nw = result.payload.directions.find((d) => d.direction === "NW")!;
    expect(nw.status).toBe("NOISE_DOYOU");
    expect(nw.isDoyouSatsu).toBe(true);
    expect(nw.tier).toBe("X");
    expect(directionLabelName(nw.status)).toBe("土用殺");
  });
  it("土用殺を赤の大凶として採点・優先する", () => {
    expect(getStatusScore("NOISE_DOYOU")).toBe(10);
    expect(isFatalNoise("NOISE_DOYOU")).toBe(true);
    expect(worstNoise(["NOISE_VOID", "NOISE_DOYOU"])).toBe("NOISE_DOYOU");
  });
});

describe("2026秋土用の日干支と空亡", () => {
  it("前後の日と旬境界をlunar-javascriptと照合する", () => {
    for (let day = 25; day <= 31; day++) {
      const core = tenchusatsuForCivilDate(2026, 10, day);
      const lunar = Solar.fromYmdHms(2026, 10, day, 12, 0, 0).getLunar();
      expect(core.ganZhi).toBe(lunar.getDayInGanZhi());
      expect(core.tenchusatsu.voidBranches.join("")).toBe(
        lunar.getDayXunKong(),
      );
      for (const hour of [0, 9, 12, 23]) {
        const instant = new Date(Date.UTC(2026, 9, day, hour - 9));
        expect(getCurrentZodiac(instant).dayZodiac).toBe(core.ganZhi[1]);
        expect(getPersonalVoidZodiac(instant)).toEqual(
          core.tenchusatsu.voidBranches,
        );
      }
      // YYYY-MM-DD は UTC 0時=JST9時。同じ暦日のため日支・旬はずれない。
      expect(getCurrentZodiac(new Date(`2026-10-${day}`)).dayZodiac).toBe(
        core.ganZhi[1],
      );
      const board = generateBoard(5);
      const instant = new Date(Date.UTC(2026, 9, day, 3));
      const voids = getPersonalVoidZodiac(instant);
      const c = calculateVectorCollision(
        1,
        board,
        board,
        board,
        voids,
        "DEFAULT",
        instant,
      );
      const filtered = filterCollisionByMode(
        c,
        1,
        null,
        voids,
        "personal_bazi",
        board,
        board,
        board,
      );
      const expected = day <= 26 ? ["NW"] : ["SW", "W"];
      expect(
        EIGHT_DIRECTIONS.filter((d) => filtered.dayLayer[d] === "NOISE_VOID"),
      ).toEqual(expected);
      const personal = judgeDay(instant, {
        honmeiStar: 1,
        voidZodiacs: ["子", "丑"],
        lon: 135,
        direction: "NW",
        tenchusatsuMode: "day_only",
        directionFilterMode: "personal_bazi",
      });
      expect(personal.voidScopes.day).toBe(day === 29 || day === 30);
      expect(personal.blockedByTenchusatsu).toBe(day === 29 || day === 30);
      console.log(
        JSON.stringify({
          date: `2026-10-${day}`,
          day: core.ganZhi,
          lunar: lunar.getDayInGanZhi(),
          xun: lunar.getDayXun(),
          void: voids.join(""),
          directions: expected,
          dayVoidForZiChou: ["子", "丑"].includes(
            getCurrentZodiac(instant).dayZodiac,
          ),
        }),
      );
    }
  });
});
