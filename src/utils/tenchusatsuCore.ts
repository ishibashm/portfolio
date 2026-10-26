export const JIKKAN = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
];
export const JUNISHI = [
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

export const TENCHUSATSU_GROUPS = [
  {
    id: 0,
    name: "戌亥",
    voidBranches: ["戌", "亥"],
    years: [2030, 2031],
  }, // Approximate recent years
  {
    id: 1,
    name: "申酉",
    voidBranches: ["申", "酉"],
    years: [2028, 2029],
  },
  {
    id: 2,
    name: "午未",
    voidBranches: ["午", "未"],
    years: [2026, 2027],
  },
  {
    id: 3,
    name: "辰巳",
    voidBranches: ["辰", "巳"],
    years: [2024, 2025],
  },
  {
    id: 4,
    name: "寅卯",
    voidBranches: ["寅", "卯"],
    years: [2022, 2023],
  },
  {
    id: 5,
    name: "子丑",
    voidBranches: ["子", "丑"],
    years: [2020, 2021],
  },
];

/** 日付のみの入力。JSTの0時で日柱が切り替わる（既存の sect=2 と同じ）。
 * 2000-01-07（甲子）からの日数を60干支に還元。時刻・旧暦の計算は不要。
 */
export function tenchusatsuForCivilDate(
  year: number,
  month: number,
  day: number,
) {
  const days = Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(2000, 0, 7)) / 86_400_000,
  );
  const ganZhiIndex = ((days % 60) + 60) % 60;
  return {
    ganZhiIndex,
    ganZhi: JIKKAN[ganZhiIndex % 10] + JUNISHI[ganZhiIndex % 12],
    tenchusatsu: TENCHUSATSU_GROUPS[Math.floor(ganZhiIndex / 10)],
  };
}
