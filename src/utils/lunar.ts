import { Solar } from 'lunar-javascript';
import { getZonedDateTimeFields } from './solarTime';

// Rokuyo Constants
export const ROKUYO = [
  "大安 (Taian)",       // 0 - Most Auspicious
  "赤口 (Shakku)",      // 1 - Bad except noon
  "先勝 (Sensho)",      // 2 - Good in morning
  "友引 (Tomobiki)",    // 3 - Good except noon (Wedding popular)
  "先負 (Sakimake)",    // 4 - Good in afternoon
  "仏滅 (Butsumetsu)",  // 5 - Least Auspicious
];

/* ORIGINAL CUSTOM DATA & LOGIC (Preserved for reference):
// Definition of Lunar Months for 2025-2027 (Target Interview Period)
// Format: [NewMoonTimestamp, IsLeapMonth, LunarMonthNumber, DaysInMonth]
const LUNAR_DATA_2026 = [
  { solar: '2026-01-01', lunarMonth: 11, lunarDay: 13 }, // Offset start
  { solar: '2026-02-17', lunarMonth: 1, lunarDay: 1 },   // Lunar NY
  { solar: '2026-03-19', lunarMonth: 2, lunarDay: 1 },
  { solar: '2026-04-17', lunarMonth: 3, lunarDay: 1 },
  { solar: '2026-05-17', lunarMonth: 4, lunarDay: 1 },
  { solar: '2026-06-15', lunarMonth: 5, lunarDay: 1 },
  { solar: '2026-07-15', lunarMonth: 6, lunarDay: 1 },
  { solar: '2026-08-13', lunarMonth: 7, lunarDay: 1 },
  { solar: '2026-09-11', lunarMonth: 8, lunarDay: 1 },
  { solar: '2026-10-11', lunarMonth: 9, lunarDay: 1 },
  { solar: '2026-11-09', lunarMonth: 10, lunarDay: 1 },
  { solar: '2026-12-09', lunarMonth: 11, lunarDay: 1 },
];

function getApproximateLunarDateOriginal(date: Date): { month: number, day: number } {
    const targetTime = date.getTime();
    let lastUnk = LUNAR_DATA_2026[0];
    for (const d of LUNAR_DATA_2026) {
        if (new Date(d.solar).getTime() <= targetTime) {
            lastUnk = d;
        } else {
            break;
        }
    }
    const startSolar = new Date(lastUnk.solar);
    const diffTime = targetTime - startSolar.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return {
        month: lastUnk.lunarMonth,
        day: lastUnk.lunarDay + diffDays
    };
}
*/

/**
 * Get Rokuyo for a given Solar Date using lunar-javascript (JST aligned)
 * Formula: (LunarMonth + LunarDay) % 6
 * Standard:
 * 0=Taian, 1=Shakku, 2=Sensho, 3=Tomobiki, 4=Sakimake, 5=Butsumetsu
 */
export function getRokuyo(date: Date): string {
    const { month, day } = getLunarDate(date);
    const sum = month + day;
    const rem = sum % 6;
    return ROKUYO[rem];
}

/**
 * Gets the actual Lunar Month and Day from lunar-javascript, JST-aligned.
 */
function getLunarDate(date: Date): { month: number, day: number } {
    const fields = getZonedDateTimeFields(date, 9);
    const solar = Solar.fromYmdHms(fields.year, fields.month, fields.day, fields.hours, fields.minutes, fields.seconds);
    const lunar = solar.getLunar();
    return {
        month: lunar.getMonth(),
        day: lunar.getDay()
    };
}

export function isWeddingFriendly(rokuyo: string): boolean {
    return rokuyo.includes("大安") || rokuyo.includes("友引");
}

export function getWeedingScore(date: Date, rokuyo: string): number {
    let score = 0;
    
    // Rokuyo Score
    if (rokuyo.includes("大安")) score += 5;
    else if (rokuyo.includes("友引")) score += 4;
    else if (rokuyo.includes("先勝")) score += 2; // Morning wedding ok
    else if (rokuyo.includes("先負")) score += 2; // Afternoon wedding ok
    else if (rokuyo.includes("赤口")) score += 1; // Only noon
    else if (rokuyo.includes("仏滅")) score += 0;

    // Weekend Score
    const day = date.getDay();
    if (day === 0) score += 3; // Sunday
    if (day === 6) score += 3; // Saturday

    // '2' day Score (Two people) - Just a fun logic
    if (date.getDate() === 22) score += 1; // Good couple day

    return score;
}

