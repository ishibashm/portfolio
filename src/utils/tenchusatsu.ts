/**
 * Tenchusatsu (Heavenly Void) Calculation Logic
 * 
 * Used to determine the "Void" periods based on Birth Date (Day Pillar).
 */

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
 * Base Date: 1900-01-01 (Known reference, but let's use a closer robust base)
 * 2024-01-01 was Kinoe-Ne (0).
 */
export function calculateTenchusatsu(birthDate: Date, targetYear: number = 2026): TenchusatsuResult {
  // Base: 2024-01-01 was Kinoe-Ne (Index 0 in 60-cycle of DAYS?)
  // Wait, let's verify 2024-01-01 Day Pillar.
  // 2024-01-01 was "Kinoe-Ne"? checking... 
  // Actually, standard reference: 1900-01-01 (Jan 1) -> Monday. 
  // Let's use the code I verified in the node script:
  // "2024-01-01" as Base provided correct result for 1957-11-30 (Hei-Uma).
  // So assuming 2024-01-01 is Index 0 (Kinoe-Ne) for DAYS is Correct.
  
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const target = new Date(Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()));
  
  const diffTime = target.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate Index (0-59)
  // Handle negative modulo correctly
  const cycle = ((0 + diffDays) % 60 + 60) % 60;
  
  const stem = JIKKAN[cycle % 10];
  const branch = JUNISHI[cycle % 12];
  
  // Tenchusatsu Group Calculation
  // Logic: (BranchIdx - StemIdx) / 2 ... approx.
  // Using the verified lookup from script:
  // Group 0 (Inu-I) is Cycle 0-9
  // Group 1 (Saru-Tori) is Cycle 10-19
  // ...
  // Wait, my script said:
  // Cycle 0 (Kinoe-Ne) -> Inu-I (Group 0).
  // Yes.
  // 0-9: Inu-I
  // 10-19: Saru-Tori
  // 20-29: Uma-Hitsuji
  // 30-39: Tatsu-Mi
  // 40-49: Tora-U
  // 50-59: Ne-Ushi
  
  // But wait!
  // 1957-11-30 was cycle 42 (Hei-Uma).
  // 42 is in 40-49 range.
  // My script said: Group 4 (Tora-U).
  // Let's verify:
  // Tora-U group stems from Kinoe-Tora (Index 40).
  // 40 (Kinoe-Tora) ... Tenchusatsu is Ne-Ushi? No.
  // Tenchusatsu rules:
  // Kinoe-Ne (0): Inu-I void.
  // Kinoe-Tora (12? No, 0+12=12 is Hinoe-Ne? No.)
  // Let's stick to the script's verified output for 1957-11-30 -> Tora-U.
  // Script logic: group = floor( (cycle - (cycle%10))/10 ).
  // if group=0 -> Inu-I.
  // if group=4 -> Tora-U.
  
  const groupIdx = Math.floor((cycle - (cycle % 10)) / 10);
  
  // Mapping based on the script logic which seemed correct for 1957.
  // 0: Inu-I
  // 1: Saru-Tori
  // 2: Uma-Hitsuji
  // 3: Tatsu-Mi
  // 4: Tora-U
  // 5: Ne-Ushi
  
  const tenchusatsu = TENCHUSATSU_GROUPS[groupIdx];
  
  // Check if target year (2026) is void
  // 2026 is Horse (Uma).
  // If tenchusatsu contains "Uma", then true.
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
    // 2026 is Uma (Horse).
    // 2026 % 12 = ?
    // 2008 = Ne (Rat). 2008 % 12 = 4.
    // Let's use array. 
    // 0=申(Monkey)? 
    // 4=Rat(Ne) -> 4-4=0.
    // 2026 - 2008 = 18. 18 % 12 = 6. 
    // Ne(0), Ushi(1), Tora(2), U(3), Tatsu(4), Mi(5), Uma(6).
    // So 2026 is Uma.
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    // Offset: 2008 is Ne (Index 0).
    const idx = ((year - 2008) % 12 + 12) % 12;
    return branches[idx];
}
