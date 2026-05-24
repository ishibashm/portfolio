import { Solar } from 'lunar-javascript';
import { getZonedDateTimeFields } from './solarTime';

export const JIKKAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const JUNISHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export const TENCHUSATSU_GROUPS = [
  { id: 0, name: "戌亥 (Inu-I)", voidBranches: ["戌", "亥"], years: [2030, 2031] }, // Approximate recent years
  { id: 1, name: "申酉 (Saru-Tori)", voidBranches: ["申", "酉"], years: [2028, 2029] },
  { id: 2, name: "午未 (Uma-Hitsuji)", voidBranches: ["午", "未"], years: [2026, 2027] },
  { id: 3, name: "辰巳 (Tatsu-Mi)", voidBranches: ["辰", "巳"], years: [2024, 2025] },
  { id: 4, name: "寅卯 (Tora-U)", voidBranches: ["寅", "卯"], years: [2022, 2023] },
  { id: 5, name: "子丑 (Ne-Ushi)", voidBranches: ["子", "丑"], years: [2020, 2021] },
];

export interface TenchusatsuResult {
  ganZhi: string;
  ganZhiIndex: number;
  tenchusatsu: typeof TENCHUSATSU_GROUPS[0];
  isYearTenchusatsu: boolean; // Is the current year (2026) a void year?
  previousVoidYears: number[];
}

/**
 * Calculate GanZhi (Day Pillar) and Tenchusatsu
 */
export function calculateTenchusatsu(birthDate: Date, targetYear: number = 2026): TenchusatsuResult {
  /* ORIGINAL FORMULA (Preserved for reference):
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const target = new Date(Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()));
  
  const diffTime = target.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate Index (0-59)
  // Handle negative modulo correctly
  const cycle = ((0 + diffDays) % 60 + 60) % 60;
  
  const stem = JIKKAN[cycle % 10];
  const branch = JUNISHI[cycle % 12];
  
  const groupIdx = Math.floor((cycle - (cycle % 10)) / 10);
  */

  const fields = getZonedDateTimeFields(birthDate, 9);
  const solar = Solar.fromYmdHms(fields.year, fields.month, fields.day, fields.hours, fields.minutes, fields.seconds);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  const dayGan = eightChar.getDayGan();
  const dayZhi = eightChar.getDayZhi();
  
  const ganIdx = JIKKAN.indexOf(dayGan);
  const zhiIdx = JUNISHI.indexOf(dayZhi);
  
  let cycle = -1;
  for (let i = 0; i < 60; i++) {
    if (i % 10 === ganIdx && i % 12 === zhiIdx) {
      cycle = i;
      break;
    }
  }
  
  if (cycle === -1) {
    cycle = 20; // Fallback
  }
  
  const stem = JIKKAN[cycle % 10];
  const branch = JUNISHI[cycle % 12];
  
  const groupIdx = Math.floor((cycle - (cycle % 10)) / 10);
  const tenchusatsu = TENCHUSATSU_GROUPS[groupIdx];
  
  // Check if target year (2026) is void
  const isYearTenchusatsu = tenchusatsu.voidBranches.includes(getYearBranch(targetYear));

  return {
    ganZhi: `${stem}${branch}`,
    ganZhiIndex: cycle,
    tenchusatsu,
    isYearTenchusatsu,
    previousVoidYears: tenchusatsu.years
  };
}

function getYearBranch(year: number): string {
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    const idx = ((year - 2008) % 12 + 12) % 12;
    return branches[idx];
}
