import { TENCHUSATSU_GROUPS, tenchusatsuForCivilDate } from "./tenchusatsuCore";
export { JIKKAN, JUNISHI, TENCHUSATSU_GROUPS } from "./tenchusatsuCore";
import { getZonedDateTimeFields } from "./solarTime";

export interface TenchusatsuResult {
  ganZhi: string;
  ganZhiIndex: number;
  tenchusatsu: (typeof TENCHUSATSU_GROUPS)[0];
  isYearTenchusatsu: boolean; // Is the current year (2026) a void year?
  previousVoidYears: number[];
}

/**
 * Calculate GanZhi (Day Pillar) and Tenchusatsu
 */
export function calculateTenchusatsu(
  birthDate: Date,
  targetYear: number = 2026,
): TenchusatsuResult {
  const fields = getZonedDateTimeFields(birthDate, 9);
  const result = tenchusatsuForCivilDate(fields.year, fields.month, fields.day);
  const { tenchusatsu } = result;

  // Check if target year (2026) is void
  const isYearTenchusatsu = tenchusatsu.voidBranches.includes(
    getYearBranch(targetYear),
  );

  return {
    ...result,
    tenchusatsu,
    isYearTenchusatsu,
    previousVoidYears: tenchusatsu.years,
  };
}

/** 立春で区切った年番号から、その年の十二支を求める。 */
export function getYearBranch(year: number): string {
  const branches = [
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
  ];
  const idx = (((year - 2008) % 12) + 12) % 12;
  return branches[idx];
}
