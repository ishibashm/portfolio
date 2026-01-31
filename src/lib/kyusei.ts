// @ts-ignore
import { Seasons } from 'astronomy-engine';

export type NineStarName = 
  | '一白水星' | '二黒土星' | '三碧木星' 
  | '四緑木星' | '五黄土星' | '六白金星' 
  | '七赤金星' | '八白土星' | '九紫火星';

export interface NineStarInfo {
    number: number;
    name: NineStarName;
    element: 'Water' | 'Earth' | 'Wood' | 'Metal' | 'Fire';
    color: string; // Tailwind class mostly
}

export const STAR_META: Record<number, NineStarInfo> = {
    1: { number: 1, name: '一白水星', element: 'Water', color: 'text-blue-400' },
    2: { number: 2, name: '二黒土星', element: 'Earth', color: 'text-amber-700' }, // Darker earth
    3: { number: 3, name: '三碧木星', element: 'Wood', color: 'text-teal-400' },
    4: { number: 4, name: '四緑木星', element: 'Wood', color: 'text-green-500' },
    5: { number: 5, name: '五黄土星', element: 'Earth', color: 'text-yellow-500' }, // Emperor
    6: { number: 6, name: '六白金星', element: 'Metal', color: 'text-gray-200' }, // Silver/Gold
    7: { number: 7, name: '七赤金星', element: 'Metal', color: 'text-red-400' }, // Often red/orange
    8: { number: 8, name: '八白土星', element: 'Earth', color: 'text-amber-200' }, // Mountain earth
    9: { number: 9, name: '九紫火星', element: 'Fire', color: 'text-purple-500' },
};

export type BoardPositions = {
    center: NineStarInfo;
    N: NineStarInfo;
    NE: NineStarInfo;
    E: NineStarInfo;
    SE: NineStarInfo;
    S: NineStarInfo;
    SW: NineStarInfo;
    W: NineStarInfo;
    NW: NineStarInfo;
};

export type KyuseiResult = {
    year: { star: NineStarInfo; board: BoardPositions };
    month: { star: NineStarInfo; board: BoardPositions };
    day: { star: NineStarInfo; board: BoardPositions; ton: 'YIN' | 'YANG' };
    time: { star: NineStarInfo; board: BoardPositions };
};

// Standard Flight Path for 3x3 Board (Luo Shu)
// Sequence: Center -> NW -> W -> NE -> S -> N -> SW -> E -> SE
// Coordinates or standard positions: 
// 5 (Center) -> 6(NW) -> 7(W) -> 8(NE) -> 9(S) -> 1(N) -> 2(SW) -> 3(E) -> 4(SE)
// This path is for Yang (Ascending). For Yin (Descending), the numbers reverse?
// Actually, the PATH is fixed. The numbers placed follow the rule.
// Yang: Center=N. Next pos gets N+1.
// Yin: Center=N. Next pos gets N-1.
const FLIGHT_PATH: (keyof BoardPositions)[] = [
    'center', 'NW', 'W', 'NE', 'S', 'N', 'SW', 'E', 'SE'
];

function generateBoard(centerNum: number, isYin: boolean): BoardPositions {
    const board: Partial<BoardPositions> = {};
    
    // Fill the board following the path
    for (let i = 0; i < 9; i++) {
        const position = FLIGHT_PATH[i];
        
        let num: number;
        if (!isYin) {
            // Yang Ton (Ascending)
            // Center is base. i=0 -> base.
            // i=1 -> base+1...
            num = centerNum + i;
            // Normalize 1-9
            num = (num - 1) % 9 + 1;
        } else {
            // Yin Ton (Descending)
            // Center is base. i=0 -> base.
            // i=1 -> base-1...
            num = centerNum - i;
            while (num <= 0) num += 9;
        }
        
        board[position] = STAR_META[num];
    }
    
    return board as BoardPositions;
}


export function calculateKyusei(birthDate: Date): KyuseiResult {
  let year = birthDate.getFullYear();
  let month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();

  // --- Year Adjust ---
  const isBeforeSetsubun = (month === 1) || (month === 2 && day < 4);
  if (isBeforeSetsubun) year -= 1;

  // --- Month Adjust ---
  const termStarts = [0, 6, 4, 6, 5, 6, 6, 7, 8, 8, 8, 7, 7];
  let solarMonth = month;
  if (day < termStarts[month]) solarMonth -= 1;
  if (solarMonth === 0) solarMonth = 12;

  // --- Year Star ---
  let ySum = String(year).split('').reduce((a, b) => a + parseInt(b), 0);
  while (ySum > 9) ySum = String(ySum).split('').reduce((a, b) => a + parseInt(b), 0);
  let yearNum = 11 - ySum;
  if (yearNum > 9) yearNum = yearNum % 9;
  if (yearNum === 0) yearNum = 9;

  // Year Board is always Yin (Descending) standard?
  // Wait, Annual stars ALWAYS fly descending (Yin). 
  // e.g. 2024 (3 Wood). Center 3. NW 2... 
  // Year and Month are ALWAYS Yin Ton (Descending).
  const yearBoard = generateBoard(yearNum, true);

  // --- Month Star ---
  const group1 = [1, 4, 7];
  const group2 = [3, 6, 9];
  let baseFebStar = 0;
  if (group1.includes(yearNum)) baseFebStar = 8;
  else if (group2.includes(yearNum)) baseFebStar = 2;
  else baseFebStar = 5;
  
  let offset = (solarMonth === 1) ? 11 : solarMonth - 2;
  let monthNum = baseFebStar - offset;
  while (monthNum <= 0) monthNum += 9;
  while (monthNum > 9) monthNum -= 9;

  // Month Board is also Yin (Descending).
  const monthBoard = generateBoard(monthNum, true);

  // --- Day Star & Time Star ---
  // Adjust date for 23:00 boundary rule (Hour >= 23 is next day)
  // For Day Star calculation, we use the "Effective Date"
  const nowHour = birthDate.getHours();
  const effectiveDate = new Date(birthDate);
  if (nowHour >= 23) {
      effectiveDate.setDate(effectiveDate.getDate() + 1);
      effectiveDate.setHours(0, 0, 0, 0); // Reset time for purity
  }

  const { dayStarNum, dayEtoNum, tonType } = calculateDayData(effectiveDate);
  const dayBoard = generateBoard(dayStarNum, tonType === 'YIN');

  // --- Time Star ---
  // Hour Index: 23-1=0, 1-3=1, ...
  // Math.floor((h + 1) / 2) % 12
  const hourIndex = Math.floor((nowHour + 1) / 2) % 12;
  
  // Determine Start Star based on Day Eto
  // Group 1: Rat(0), Rabbit(3), Horse(6), Rooster(9)
  // Group 2: Ox(1), Dragon(4), Sheep(7), Dog(10)
  // Group 3: Tiger(2), Snake(5), Monkey(8), Boar(11)
  
  const etoRemainder = dayEtoNum % 3; // 0, 1, 2
  let startStar = 0;
  
  if (tonType === 'YANG') {
      if (etoRemainder === 0) startStar = 1;      // Rat etc -> 1
      else if (etoRemainder === 1) startStar = 4; // Ox etc -> 4
      else startStar = 7;                         // Tiger etc -> 7
      
      // Yang: Ascending from Start
      // Star = Start + hourIndex
      let timeNum = startStar + hourIndex;
      timeNum = (timeNum - 1) % 9 + 1;
      
      var timeBoard = generateBoard(timeNum, false); // Yang Ton -> Board Ascends?
      // Wait, Time Board logic:
      // Does the BOARD fly ascending or descending?
      // Rule: "Yin Ton days -> Time Board flies Yin (Desc). Yang Ton days -> Time Board flies Yang (Asc)."
      // Wait, let me verify.
      // Usually, ALL boards fly Descending (Standard Luo Shu flight is always center->NW->W... putting numbers in descending order?)
      // Actually standard Luo Shu path is fixed. The numbers put in it depend on Yin/Yang.
      // If Yang Day: Time Star sequence 1,2,3... 
      // Does the Board layout (flight) also change?
      // Standard Kyusei: All boards (Year/Month/Day/Time) fly DESCENDING numbers (Yin) usually.
      // EXCEPT when specifically "Yang Ton".
      // Let's assume Time Board follows the Ton of the Day.
      // If Day is Yang Ton, Time Board flies Yang (Ascending).
      // If Day is Yin Ton, Time Board flies Yin (Descending).
      // This is consistent.
      timeBoard = generateBoard(timeNum, tonType !== 'YANG'); // wait.
      // generateBoard logic:
      // if !isYin (Yang) -> num = center + i. (Ascending numbers in flight).
      // if isYin (Yin) -> num = center - i. (Descending numbers in flight).
      
      // So if Ton is Yang, we pass false.
      // timeBoard = generateBoard(timeNum, currentTon === 'YIN');
  } else {
      // Yin Ton
      if (etoRemainder === 0) startStar = 9;
      else if (etoRemainder === 1) startStar = 6;
      else startStar = 3;
      
      // Yin: Descending from Start
      let timeNum = startStar - hourIndex;
      while (timeNum <= 0) timeNum += 9;
      
      // Board follows Yin (Descending)
      var timeBoard = generateBoard(timeNum, true);
  }

  // Correction on block scoping
  const finalTimeBoard = (tonType === 'YANG') 
      ? generateBoard( getYangTimeStar(dayEtoNum, hourIndex), false )
      : generateBoard( getYinTimeStar(dayEtoNum, hourIndex), true );

  return {
    year: { star: STAR_META[yearNum], board: yearBoard },
    month: { star: STAR_META[monthNum], board: monthBoard },
    day: { star: STAR_META[dayStarNum], board: dayBoard, ton: tonType },
    time: { star: finalTimeBoard.center, board: finalTimeBoard }
  };
}

function getYangTimeStar(eto: number, hIdx: number): number {
    const rem = eto % 3;
    let start = (rem === 0) ? 1 : (rem === 1) ? 4 : 7;
    let s = start + hIdx;
    return (s - 1) % 9 + 1;
}

function getYinTimeStar(eto: number, hIdx: number): number {
    const rem = eto % 3;
    let start = (rem === 0) ? 9 : (rem === 1) ? 6 : 3;
    let s = start - hIdx;
    while (s <= 0) s += 9;
    return s;
}


// --- Day Calculation Helper ---
function calculateDayData(targetDate: Date): { dayStarNum: number, dayEtoNum: number, tonType: 'YIN' | 'YANG' } {
    const t = new Date(targetDate);
    t.setHours(12, 0, 0, 0); 
    const tYear = t.getFullYear();

    const checkYears = [tYear - 1, tYear, tYear + 1];
    let switchPoints: { date: Date; type: 'YIN' | 'YANG' }[] = [];

    checkYears.forEach(y => {
        const seasons = Seasons(y);
        const summerSolstice = seasons.jun_solstice.date; 
        const winterSolstice = seasons.dec_solstice.date;
        switchPoints.push({ date: getNearestKinoeNe(summerSolstice), type: 'YIN' }); 
        switchPoints.push({ date: getNearestKinoeNe(winterSolstice), type: 'YANG' }); 
    });

    switchPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    let currentPeriod = switchPoints[0];
    for (const p of switchPoints) {
        if (p.date.getTime() <= t.getTime()) currentPeriod = p;
        else break;
    }

    const diffTime = t.getTime() - currentPeriod.date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    
    // Day Eto Number (0-59)
    // Anchor Kinoe-Ne (2024-01-01) is 0.
    const ANCHOR = new Date(2024, 0, 1, 12, 0, 0);
    const totalDiff = Math.floor((t.getTime() - ANCHOR.getTime()) / (1000 * 60 * 60 * 24));
    let etoNum = totalDiff % 60;
    if (etoNum < 0) etoNum += 60;

    let star = 0;
    if (currentPeriod.type === 'YANG') {
        star = (1 + diffDays); 
        star = ((star - 1) % 9) + 1;
    } else {
        star = 9 - (diffDays % 9);
        if (star <= 0) star += 9;
    }

    return { dayStarNum: star, dayEtoNum: etoNum, tonType: currentPeriod.type };
}

const ANCHOR_KINOENE = new Date(2024, 0, 1, 12, 0, 0); 
function getNearestKinoeNe(baseDate: Date): Date {
    const d = new Date(baseDate);
    d.setHours(12, 0, 0, 0);
    const diffMs = d.getTime() - ANCHOR_KINOENE.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    let remainder = diffDays % 60;
    if (remainder < 0) remainder += 60;
    let offset = (remainder < 30) ? -remainder : 60 - remainder;
    const result = new Date(d);
    result.setDate(d.getDate() + offset);
    return result;
}
