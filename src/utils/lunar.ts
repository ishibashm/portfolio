import { Solar } from "lunar-javascript";
import { getZonedDateTimeFields } from "./solarTime";

// Rokuyo Constants
export const ROKUYO = [
  "大安 (Taian)", // 0 - Most Auspicious
  "赤口 (Shakku)", // 1 - Bad except noon
  "先勝 (Sensho)", // 2 - Good in morning
  "友引 (Tomobiki)", // 3 - Good except noon (Wedding popular)
  "先負 (Sakimake)", // 4 - Good in afternoon
  "仏滅 (Butsumetsu)", // 5 - Least Auspicious
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
function getLunarDate(date: Date): { month: number; day: number } {
  const fields = getZonedDateTimeFields(date, 9);
  const solar = Solar.fromYmdHms(
    fields.year,
    fields.month,
    fields.day,
    fields.hours,
    fields.minutes,
    fields.seconds,
  );
  const lunar = solar.getLunar();
  return {
    month: lunar.getMonth(),
    day: lunar.getDay(),
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
  else if (rokuyo.includes("先勝"))
    score += 2; // Morning wedding ok
  else if (rokuyo.includes("先負"))
    score += 2; // Afternoon wedding ok
  else if (rokuyo.includes("赤口"))
    score += 1; // Only noon
  else if (rokuyo.includes("仏滅")) score += 0;

  // Weekend Score
  const day = date.getDay();
  if (day === 0) score += 3; // Sunday
  if (day === 6) score += 3; // Saturday

  // '2' day Score (Two people) - Just a fun logic
  if (date.getDate() === 22) score += 1; // Good couple day

  return score;
}

// 一粒万倍日の地支対応表
const ICHIRYUMANBAI_MAP: Record<string, string[]> = {
  寅: ["丑", "午"], // 正月
  卯: ["寅", "酉"], // 二月
  辰: ["子", "卯"], // 三月
  巳: ["卯", "辰"], // 四月
  午: ["巳", "午"], // 五月
  未: ["午", "酉"], // 六月
  申: ["子", "未"], // 七月
  酉: ["卯", "申"], // 八月
  戌: ["午", "酉"], // 九月
  亥: ["酉", "戌"], // 十月
  子: ["亥", "子"], // 十一月
  丑: ["子", "卯"], // 十二月
};

/**
 * 吉日（一粒万倍日・天赦日）の判定を行う
 */
export function getLuckyDays(date: Date): {
  isIchiryumanbai: boolean;
  isTensho: boolean;
  labels: string[];
} {
  const fields = getZonedDateTimeFields(date, 9);
  const solar = Solar.fromYmdHms(
    fields.year,
    fields.month,
    fields.day,
    fields.hours,
    fields.minutes,
    fields.seconds,
  );
  const lunar = solar.getLunar();

  const monthZhi = lunar.getMonthZhi();
  const dayZhi = lunar.getDayZhi();
  const dayGanZhi = lunar.getDayInGanZhi();

  // 1. 一粒万倍日
  const isIchiryumanbai =
    ICHIRYUMANBAI_MAP[monthZhi]?.includes(dayZhi) || false;

  // 2. 天赦日
  let isTensho = false;
  if (["寅", "卯", "辰"].includes(monthZhi) && dayGanZhi === "戊寅")
    isTensho = true;
  else if (["巳", "午", "未"].includes(monthZhi) && dayGanZhi === "甲午")
    isTensho = true;
  else if (["申", "酉", "戌"].includes(monthZhi) && dayGanZhi === "戊申")
    isTensho = true;
  else if (["亥", "子", "丑"].includes(monthZhi) && dayGanZhi === "甲子")
    isTensho = true;

  const labels: string[] = [];
  if (isIchiryumanbai) labels.push("一粒万倍日");
  if (isTensho) labels.push("天赦日");

  return { isIchiryumanbai, isTensho, labels };
}

/**
 * 日本の祝日を簡易判定する（振替休日・国民の休日対応）
 */
export function isJapaneseHoliday(date: Date): {
  isHoliday: boolean;
  name: string;
} {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 1. 固定祝日の定義
  const fixedHolidays: Record<string, string> = {
    "1-1": "元日",
    "2-11": "建国記念の日",
    "2-23": "天皇誕生日",
    "4-29": "昭和の日",
    "5-3": "憲法記念日",
    "5-4": "みどりの日",
    "5-5": "こどもの日",
    "8-11": "山の日",
    "11-3": "文化の日",
    "11-23": "勤労感謝の日",
  };

  // 2. 春分・秋分の計算
  const getVernalEquinox = (y: number) => {
    if (y < 1900 || y > 2099) return 20;
    return Math.floor(
      20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4),
    );
  };
  const getAutumnalEquinox = (y: number) => {
    if (y < 1900 || y > 2099) return 23;
    return Math.floor(
      23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4),
    );
  };

  const vernalEquinox = getVernalEquinox(year);
  const autumnalEquinox = getAutumnalEquinox(year);

  if (month === 3 && day === vernalEquinox)
    return { isHoliday: true, name: "春分の日" };
  if (month === 9 && day === autumnalEquinox)
    return { isHoliday: true, name: "秋分の日" };

  // 3. ハッピーマンデーの計算（第N月曜日）
  const getMondayDate = (y: number, m: number, count: number) => {
    const firstDay = new Date(y, m - 1, 1).getDay();
    const firstMonday = ((8 - firstDay) % 7) + 1;
    return firstMonday + 7 * (count - 1);
  };

  if (month === 1 && day === getMondayDate(year, 1, 2))
    return { isHoliday: true, name: "成人の日" };
  if (month === 7 && day === getMondayDate(year, 7, 3))
    return { isHoliday: true, name: "海の日" };
  if (month === 9 && day === getMondayDate(year, 9, 3))
    return { isHoliday: true, name: "敬老の日" };
  if (month === 10 && day === getMondayDate(year, 10, 2))
    return { isHoliday: true, name: "スポーツの日" };

  // 固定祝日の判定
  const key = `${month}-${day}`;
  if (fixedHolidays[key]) return { isHoliday: true, name: fixedHolidays[key] };

  // 振替休日の判定
  const prevDate = new Date(date);
  prevDate.setDate(date.getDate() - 1);

  if (date.getDay() === 1) {
    // 月曜日の場合
    const prevH = isJapaneseHoliday(prevDate);
    if (prevH.isHoliday && !prevH.name.startsWith("振替休日")) {
      return { isHoliday: true, name: `振替休日 (${prevH.name})` };
    }
  } else if (date.getDay() === 2 || date.getDay() === 3) {
    // 5月6日の振替休日判定（憲法記念日、みどりの日、こどもの日のいずれかが日曜日）
    if (month === 5 && day === 6) {
      const d3 = new Date(year, 4, 3).getDay();
      const d4 = new Date(year, 4, 4).getDay();
      const d5 = new Date(year, 4, 5).getDay();
      if (d3 === 0 || d4 === 0 || d5 === 0) {
        return { isHoliday: true, name: "振替休日" };
      }
    }
  }

  // 国民の休日の判定
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + 1);

  // 国民の休日の判定のためには、祝日判定自体をループしないように簡易取得
  const isPrevH =
    fixedHolidays[`${prevDate.getMonth() + 1}-${prevDate.getDate()}`] ||
    (prevDate.getMonth() + 1 === 3 && prevDate.getDate() === vernalEquinox) ||
    (prevDate.getMonth() + 1 === 9 && prevDate.getDate() === autumnalEquinox);
  const isNextH =
    fixedHolidays[`${nextDate.getMonth() + 1}-${nextDate.getDate()}`] ||
    (nextDate.getMonth() + 1 === 3 && nextDate.getDate() === vernalEquinox) ||
    (nextDate.getMonth() + 1 === 9 && nextDate.getDate() === autumnalEquinox);

  if (isPrevH && isNextH) {
    return { isHoliday: true, name: "国民の休日" };
  }

  return { isHoliday: false, name: "" };
}
