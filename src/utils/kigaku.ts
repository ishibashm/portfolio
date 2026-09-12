// Kyusei (Nine Stars) & Hachimon (Eight Gates) Logic

// --- Constants ---

export const KYUSEI = [
  {
    number: 1,
    name: "Ippaku Suisei",
    japanese: "一白水星",
    color: "White",
    element: "Water",
  }, // 0 (using number as index? No, usually 1-indexed)
  {
    number: 2,
    name: "Jikoku Dosei",
    japanese: "二黒土星",
    color: "Black",
    element: "Earth",
  },
  {
    number: 3,
    name: "Sanpeki Mokusei",
    japanese: "三碧木星",
    color: "Blue",
    element: "Wood",
  },
  {
    number: 4,
    name: "Shiroku Mokusei",
    japanese: "四緑木星",
    color: "Green",
    element: "Wood",
  },
  {
    number: 5,
    name: "Goou Dosei",
    japanese: "五黄土星",
    color: "Yellow",
    element: "Earth",
  },
  {
    number: 6,
    name: "Roppaku Kinsei",
    japanese: "六白金星",
    color: "White",
    element: "Metal",
  },
  {
    number: 7,
    name: "Shichiseki Kinsei",
    japanese: "七赤金星",
    color: "Red",
    element: "Metal",
  },
  {
    number: 8,
    name: "Happaku Dosei",
    japanese: "八白土星",
    color: "White",
    element: "Earth",
  },
  {
    number: 9,
    name: "Kyushi Kasei",
    japanese: "九紫火星",
    color: "Purple",
    element: "Fire",
  },
];

/*
  HACHIMON（八門）と getHourlyHachimon はここにあったが消した。
  盤を組まず、月の陰陽で起点を変えて刻の順に 8 つの門を回すだけの
  仮実装だった（ソースに "Placeholder Algorithm … Just returning a cycle
  for visualization" とあった）。日干を変えても門が変わらない。
  時間帯の判定（lib/timePhase）と表示から外したあと、実装ごと消した
  （#1238〜）。旧実装は __tests__/timePhaseNoPlaceholderGate.test.ts に
  写してある。戻すなら奇門遁甲の時盤を実際に組んでから。
*/

// --- Helper Functions ---

// Get Kyusei object by number (1-9)
export const getKyusei = (num: number) =>
  KYUSEI.find((k) => k.number === num) || KYUSEI[4];

// Calculate Hourly Kyusei
// Logic:
// Days: Ne/U/Uma/Tori (Child/Rabbit/Horse/Rooster) -> Rat Hour = 1 (Ippaku)
// Days: Ushi/Tatsu/Hitsuji/Inu (Ox/Dragon/Sheep/Dog) -> Rat Hour = 4 (Shiroku)
// Days: Tora/Mi/Saru/I (Tiger/Snake/Monkey/Boar) -> Rat Hour = 7 (Shichiseki)
// Sequence: Descending (1 -> 9 -> 8...)
export function getHourlyKyusei(
  dayJunishiIndex: number,
  hourJunishiIndex: number,
): (typeof KYUSEI)[0] {
  let startStar = 1;

  // 日の十二支を 3 で割った余りで 3 組に分ける。
  //
  //   余り 0: 子(0) 卯(3) 午(6) 酉(9)    → 子の刻が一白
  //   余り 1: 丑(1) 辰(4) 未(7) 戌(10)   → 子の刻が四緑
  //   余り 2: 寅(2) 巳(5) 申(8) 亥(11)   → 子の刻が七赤
  //
  // 以前ここに `dayJunishiIndex % 4` を試した跡が残っていて、
  // 「0%4=0, 3%4=3, 6%4=2 (NO)」と自分で否定したうえで結果を
  // 使わずに捨てていた。4 では組にならない（上の並びは 3 つおき）。
  const rem = dayJunishiIndex % 3;
  if (rem === 0)
    startStar = 1; // Ne, U, Uma, Tori... Wait. Ne=0. U=3. Uma=6. Tori=9. 0,3,6,9 % 3 == 0. Correct!
  else if (rem === 1)
    startStar = 4; // Ushi(1), Tatsu(4), Hitsuji(7), Inu(10). 1,4,7,10 % 3 == 1. Correct!
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

export function getKyuseiBoard(
  centerStar: (typeof KYUSEI)[0],
): (typeof KYUSEI)[0][] {
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
