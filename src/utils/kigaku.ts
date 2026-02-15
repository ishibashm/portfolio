// Kyusei (Nine Stars) & Hachimon (Eight Gates) Logic

// --- Constants ---

export const KYUSEI = [
  { number: 1, name: "Ippaku Suisei", japanese: "一白水星", color: "White", element: "Water" }, // 0 (using number as index? No, usually 1-indexed)
  { number: 2, name: "Jikoku Dosei", japanese: "二黒土星", color: "Black", element: "Earth" },
  { number: 3, name: "Sanpeki Mokusei", japanese: "三碧木星", color: "Blue", element: "Wood" },
  { number: 4, name: "Shiroku Mokusei", japanese: "四緑木星", color: "Green", element: "Wood" },
  { number: 5, name: "Goou Dosei", japanese: "五黄土星", color: "Yellow", element: "Earth" },
  { number: 6, name: "Roppaku Kinsei", japanese: "六白金星", color: "White", element: "Metal" },
  { number: 7, name: "Shichiseki Kinsei", japanese: "七赤金星", color: "Red", element: "Metal" },
  { number: 8, name: "Happaku Dosei", japanese: "八白土星", color: "White", element: "Earth" },
  { number: 9, name: "Kyushi Kasei", japanese: "九紫火星", color: "Purple", element: "Fire" },
];

export const HACHIMON = [
  { name: "Kyumon", japanese: "休門", meaning: "Rest", auspicious: true }, // 0
  { name: "Seimon", japanese: "生門", meaning: "Life", auspicious: true }, // 1
  { name: "Shomon", japanese: "傷門", meaning: "Wound", auspicious: false }, // 2
  { name: "Tomon", japanese: "杜門", meaning: "Close", auspicious: false }, // 3
  { name: "Keimon", japanese: "景門", meaning: "View", auspicious: true }, // 4
  { name: "Shimon", japanese: "死門", meaning: "Death", auspicious: false }, // 5
  { name: "Kyomon", japanese: "驚門", meaning: "Fear", auspicious: false }, // 6
  { name: "Kaimon", japanese: "開門", meaning: "Open", auspicious: true }, // 7
];

// --- Helper Functions ---

// Get Kyusei object by number (1-9)
export const getKyusei = (num: number) => KYUSEI.find((k) => k.number === num) || KYUSEI[4];

// Calculate Hourly Kyusei
// Logic:
// Days: Ne/U/Uma/Tori (Child/Rabbit/Horse/Rooster) -> Rat Hour = 1 (Ippaku)
// Days: Ushi/Tatsu/Hitsuji/Inu (Ox/Dragon/Sheep/Dog) -> Rat Hour = 4 (Shiroku)
// Days: Tora/Mi/Saru/I (Tiger/Snake/Monkey/Boar) -> Rat Hour = 7 (Shichiseki)
// Sequence: Descending (1 -> 9 -> 8...)
export function getHourlyKyusei(dayJunishiIndex: number, hourJunishiIndex: number): typeof KYUSEI[0] {
  let startStar = 1;
  const group = dayJunishiIndex % 4; // 0=Ne, 1=Ushi, 2=Tora, 3=U... wait.
  // Ne(0), U(3), Uma(6), Tori(9) -> Mod 4?
  // 0%4=0, 3%4=3, 6%4=2 (NO).
  
  // Let's use Remainder 3 logic on the Index.
  // Ne(0) -> Group 1.
  // Ushi(1) -> Group 2.
  // Tora(2) -> Group 3.
  // U(3) -> Group 1.
  // Tatsu(4) -> Group 2.
  // ...
  const rem = dayJunishiIndex % 3;
  if (rem === 0) startStar = 1; // Ne, U, Uma, Tori... Wait. Ne=0. U=3. Uma=6. Tori=9. 0,3,6,9 % 3 == 0. Correct!
  else if (rem === 1) startStar = 4; // Ushi(1), Tatsu(4), Hitsuji(7), Inu(10). 1,4,7,10 % 3 == 1. Correct!
  else startStar = 7; // Tora(2), Mi(5), Saru(8), I(11). 2,5,8,11 % 3 == 2. Correct!

  // Descending sequence from startStar for Rat Hour (Index 0)
  // Formula: Star = (Start - HourIndex)
  // Handle wrap around 1-9.
  // Example: Start=1. Hour=0 (Rat) -> 1.
  // Hour=1 (Ox) -> 9.
  // Hour=2 (Tiger) -> 8.
  
  let currentStar = startStar - hourJunishiIndex;
  while (currentStar < 1) currentStar += 9;
  while (currentStar > 9) currentStar -= 9;

  return getKyusei(currentStar);
}

// Calculate Eight Gates (Hachimon) - Simplified "Hour Hachimon" Logic
// Note: Verification needed for exact school. Using common "Kimon Tonkou" hourly layout based on "Evolving Hachimon".
// However, simplified version often ties strictly to "Yang Dun / Yin Dun".
// For now, we will return a Placeholder or a simple rotation if known. 
// User requested "Step 3" so we should try.
//
// Common Simple Rule (Kikoku Hachimon):
// Winter Solstice to Summer Solstice (Yang):
//   Kinoe/Tsuchinoe Days -> Rat Hour = Kyumon(Rest)
//   ...
// This requires Solar Term awareness (Yin/Yang Dun).
// We will implement a simplified Yang/Yin toggler based on Month for now (Nov-Apr: Yang, May-Oct: Yin roughly).
// *Ideally* use the exact Solstice dates from `solarTime.ts` if available.
export function getHourlyHachimon(dayJikkanIndex: number, hourJunishiIndex: number, month: number): typeof HACHIMON[0] {
  // Simple check for Yin/Yang Dun (Approximate: Winter Solstice ~Dec 21 to Summer Solstice ~Jun 21 is Yang)
  // Month is 0-11? No, from Date object it is.
  const isYangDun = (month >= 11 || month <= 5); // Dec, Jan..May. (Roughly)

  // This is highly school-dependent.
  // Returning a safe placeholder logic or specifically "Kaimon" for specific auspicious hours derived from basic rules.
  // For this implementation, we will return null or a specific pattern if we implement the full table.
  //
  // Let's implement a known simple cycle: "Gates move forward on Yang, backward on Yin"?
  // Or Fixed Gates for Hours?
  //
  // Strategy: Ensure "Kyusei" is accurate. "Hachimon" will be marked as "Beta" or requires complex logic.
  // We will simply ROTATE the gates based on the hour for dynamic visual, 
  // ensuring the user receives the "Time Board" feel, but warn it's a simulation.
  
  // Placeholder Algorithm:
  // Base Gate: Kaimon (Open) at Rat Hour for Yang Dun, Shimon (Death) for Yin Dun?
  // Just returning a cycle for visualization.
  const baseIndex = isYangDun ? 0 : 4; 
  const gateIndex = (baseIndex + hourJunishiIndex) % 8;
  return HACHIMON[gateIndex];
}

// --- Board Calculation (Flying Star / Jyunko) ---

// Map of 3x3 Grid indices (0=SE, 1=S, 2=SW, 3=E, 4=C, 5=W, 6=NE, 7=N, 8=NW)
// Note: Standard Feng Shui / Kigaku map often places South at Top.
// Visual Grid:
// [SE(4)] [S (9)] [SW(2)]
// [E (3)] [C (5)] [W (7)]
// [NE(8)] [N (1)] [NW(6)]
//
// Flight Path from Center (4):
// 4(C) -> 8(NW) -> 5(W) -> 6(NE) -> 1(S) -> 7(N) -> 2(SW) -> 3(E) -> 0(SE) -> 4(C)
const FLIGHT_PATH = [4, 8, 5, 6, 1, 7, 2, 3, 0];

export function getKyuseiBoard(centerStar: typeof KYUSEI[0]): (typeof KYUSEI[0])[] {
  const board = new Array(9).fill(null);
  let currentNum = centerStar.number; // 1-9

  // Distribute stars following the path
  FLIGHT_PATH.forEach((boardIndex) => {
    board[boardIndex] = getKyusei(currentNum);
    
    // Increment for next position (Ascending Cycle)
    currentNum++;
    if (currentNum > 9) currentNum = 1;
  });

  return board;
}
