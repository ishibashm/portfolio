import { describe, expect, it } from "vitest";
import { getRecommendationStarCount } from "@/utils/arbitrageHelpers";
import {
  formatShortStayBaseMessage,
  getBaseAstrologyStatus,
  isRecommendedRelocationStatus,
} from "@/lib/relocationPresentation";
import { isValidIsoDate } from "@/utils/dateValidation";
import { getAuspiciousDayErrorMessage } from "@/lib/auspiciousDayErrors";
import { getAgentLogFeedState } from "@/lib/agentLogState";
import { birthYearsThrough, currentYearInJapan } from "@/lib/kigakuContent";

describe("medium-priority QA regression helpers", () => {
  it("uses the same recommendation score and avoid-status rule for every star display", () => {
    expect(getRecommendationStarCount(82, "OPTIMAL")).toBe(5);
    expect(getRecommendationStarCount(72, "SAFE")).toBe(4);
    expect(getRecommendationStarCount(99, "NOISE_GOU")).toBe(1);
  });

  it("keeps recommended base statuses when explanatory flags are appended", () => {
    expect(getBaseAstrologyStatus("OPTIMAL + JUPITER_ASC")).toBe("OPTIMAL");
    expect(isRecommendedRelocationStatus("OPTIMAL + JUPITER_ASC")).toBe(true);
    expect(isRecommendedRelocationStatus("SAFE + VENUS_ASC")).toBe(true);
    expect(isRecommendedRelocationStatus("SAFE + DOYOU_HAZARD")).toBe(false);
    expect(isRecommendedRelocationStatus("SAFE + LUNAR_PENALTY")).toBe(false);
    expect(isRecommendedRelocationStatus("NOISE_GOU + TENDO_LINE")).toBe(false);
  });

  it("describes a short stay using the actual active base", () => {
    expect(formatShortStayBaseMessage("大阪市北区")).toContain("大阪市北区");
    expect(formatShortStayBaseMessage("大阪市北区")).not.toContain("京都");
  });

  it.each([
    ["1990-01-01", true],
    ["2000-02-29", true],
    ["2001-02-29", false],
    ["1990-13-01", false],
    ["not-a-date", false],
  ])("validates companion birth date %s", (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });

  it("maps API error codes to user-facing Japanese messages", () => {
    expect(getAuspiciousDayErrorMessage("INVALID_RANGE")).toContain("終了日");
    expect(getAuspiciousDayErrorMessage("INVALID_BIRTH_DATE")).toContain(
      "生年月日",
    );
    expect(getAuspiciousDayErrorMessage("UNKNOWN_INTERNAL_CODE")).not.toContain(
      "UNKNOWN_INTERNAL_CODE",
    );
  });

  it("distinguishes database failure from an empty agent log", () => {
    expect(getAgentLogFeedState(false, 0)).toBe("empty");
    expect(getAgentLogFeedState(true, 0)).toBe("unavailable");
    expect(getAgentLogFeedState(false, 3)).toBe("ready");
  });

  it("generates the birth-year list through a supplied current year", () => {
    const years = birthYearsThrough(2026);
    expect(years[0]).toBe(1950);
    expect(years.at(-1)).toBe(2026);
  });

  it("uses the Japanese calendar year at the UTC year boundary", () => {
    expect(currentYearInJapan(new Date("2025-12-31T15:00:00.000Z"))).toBe(
      2026,
    );
  });

});
