import { getHourlyKyusei, getHourlyHachimon, KYUSEI, HACHIMON } from "./kigaku";
import { Solar } from "lunar-javascript";

/**
 * Helper to extract local date fields in a specific timezone offset (in hours).
 * Returns year, month (1-indexed), day, hours, minutes, seconds.
 * Independent of the system timezone of the runtime environment.
 */
export function getZonedDateTimeFields(date: Date, offsetHours: number = 9) {
  const shiftedDate = new Date(date.getTime() + offsetHours * 3600000);
  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1, // 1-indexed
    day: shiftedDate.getUTCDate(),
    hours: shiftedDate.getUTCHours(),
    minutes: shiftedDate.getUTCMinutes(),
    seconds: shiftedDate.getUTCSeconds(),
  };
}

/**
 * Solar Time Calculation Logic
 * Optimized for Frontend usage
 */

export interface SolarTimeResult {
  solarTime: Date;
  equationOfTime: number; // minutes
  longitudeCorrection: number; // minutes
  totalCorrection: number; // minutes
}

export function getLongitudeCorrection(lon: number, timezoneOffsetHours: number): number {
  const standardMeridian = timezoneOffsetHours * 15.0;
  const degreeDelta = lon - standardMeridian;
  return degreeDelta * 4.0;
}

/**
 * Calculate True Solar Time (Local Solar Time).
 * @param date The standard time date object.
 * @param longitude Longitude of the location (e.g., 135.75 for Kyoto).
 * @param timezoneOffset Timezone offset in hours (e.g., 9 for JST).
 */
export function calculateSolarTime(
  date: Date,
  longitude: number,
  timezoneOffset?: number,
): SolarTimeResult {
  const tzOffset = timezoneOffset !== undefined ? timezoneOffset : Math.round(longitude / 15);

  // 1. Day of Year (n)
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  // 2. Equation of Time (EoT) approximation
  // B = 360 * (n - 81) / 365  (in degrees)
  const B = (360 / 365) * (dayOfYear - 81);
  const B_rad = (B * Math.PI) / 180;

  // EoT = 9.87 * sin(2B) - 7.53 * cos(B) - 1.5 * sin(B) (in minutes)
  const eot =
    9.87 * Math.sin(2 * B_rad) - 7.53 * Math.cos(B_rad) - 1.5 * Math.sin(B_rad);

  // 3. Longitude Correction (4 minutes per degree difference from standard meridian)
  const longitudeCorrection = getLongitudeCorrection(longitude, tzOffset);

  // Total Correction
  const totalCorrectionMinutes = eot + longitudeCorrection;

  // Apply correction
  // Create a new date object adjusted by minutes
  const solarTime = new Date(date.getTime() + totalCorrectionMinutes * 60000);

  return {
    solarTime,
    equationOfTime: eot,
    longitudeCorrection,
    totalCorrection: totalCorrectionMinutes,
  };
}

// --- Ten Stems (Jikkan) & Twelve Branches (Junishi) Logic ---

const JIKKAN = [
  { name: "Kinoe", kanji: "甲" }, // 0
  { name: "Kinoto", kanji: "乙" }, // 1
  { name: "Hinoe", kanji: "丙" }, // 2
  { name: "Hinoto", kanji: "丁" }, // 3
  { name: "Tsuchinoe", kanji: "戊" }, // 4
  { name: "Tsuchinoto", kanji: "己" }, // 5
  { name: "Kanoe", kanji: "庚" }, // 6
  { name: "Kanoto", kanji: "辛" }, // 7
  { name: "Mizunoe", kanji: "壬" }, // 8
  { name: "Mizunoto", kanji: "癸" }, // 9
];

/**
 * Get Day Stem (Jikkan) index (0-9).
 * Base date: Jan 1, 2000 was Saturday.
 * Jan 1, 2000 was 'Tsuchinoe-Uma' (Stem 4, Branch 6).
 */
function getDayStemIndex(date: Date): number {
  /* ORIGINAL FORMULA (Preserved for reference):
  const base = new Date(2000, 0, 1); // Jan 1 2000
  const diff = date.getTime() - base.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  let idx = (4 + days) % 10;
  if (idx < 0) idx += 10;
  return idx;
  */
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
  const eightChar = lunar.getEightChar();
  const dayGan = eightChar.getDayGan();
  const JIKKAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  return JIKKAN.indexOf(dayGan);
}

/**
 * Get Hour Stem (Jikkan) index based on Day Stem and Hour Branch.
 * Uses "Five Rat Escape" (Goko Tonkou) method.
 *
 * Rules (Day Stem -> Rat Hour Stem):
 * 甲(0), 己(5) -> 甲(0) (Kinoe-Ne)
 * 乙(1), 庚(6) -> 丙(2) (Hinoe-Ne)
 * 丙(2), 辛(7) -> 戊(4) (Tsuchinoe-Ne)
 * 丁(3), 壬(8) -> 庚(6) (Kanoe-Ne)
 * 戊(4), 癸(9) -> 壬(8) (Mizunoe-Ne)
 *
 * Formula: ((DayStem % 5) * 2 + HourBranchOffset) % 10
 * HourBranchOffset: Rat=0, Ox=1, ...
 */
function getHourStemIndex(dayStemIdx: number, hourBranchIdx: number): number {
  const startStem = (dayStemIdx % 5) * 2;
  return (startStem + hourBranchIdx) % 10;
}
export function getKimonHour(solarDt: Date): {
  name: string;
  japanese: string;
  reading: string;
  note?: string;
} {
  const hour = solarDt.getHours();

  if (hour >= 23 || hour < 1) {
    return { name: "Rat", japanese: "子", reading: "Ne" };
  } else if (hour >= 1 && hour < 3) {
    return { name: "Ox", japanese: "丑", reading: "Ushi" };
  } else if (hour >= 3 && hour < 5) {
    return {
      name: "Tiger",
      japanese: "寅",
      reading: "Tora",
      note: "Devils Gate (Kimon)",
    };
  } else if (hour >= 5 && hour < 7) {
    return { name: "Rabbit", japanese: "卯", reading: "U" };
  } else if (hour >= 7 && hour < 9) {
    return { name: "Dragon", japanese: "辰", reading: "Tatsu" };
  } else if (hour >= 9 && hour < 11) {
    return { name: "Snake", japanese: "巳", reading: "Mi" };
  } else if (hour >= 11 && hour < 13) {
    return { name: "Horse", japanese: "午", reading: "Uma" };
  } else if (hour >= 13 && hour < 15) {
    return {
      name: "Sheep",
      japanese: "未",
      reading: "Hitsuji",
      note: "Tenchusatsu (Void)",
    };
  } else if (hour >= 15 && hour < 17) {
    return { name: "Monkey", japanese: "申", reading: "Saru" };
  } else if (hour >= 17 && hour < 19) {
    return { name: "Rooster", japanese: "酉", reading: "Tori" };
  } else if (hour >= 19 && hour < 21) {
    return { name: "Dog", japanese: "戌", reading: "Inu" };
  } else if (hour >= 21 && hour < 23) {
    return { name: "Boar", japanese: "亥", reading: "I" };
  } else {
    return { name: "Unknown", japanese: "不明", reading: "Unknown" };
  }
}

export interface KimonScheduleItem {
  name: string;
  japanese: string;
  reading: string;
  stemName: string;
  stemKanji: string;
  etoKanji: string; // Stem + Branch (e.g. 甲子)
  note?: string;
  startStandard: Date;
  endStandard: Date;
  kyusei: (typeof KYUSEI)[0]; // Added
  hachimon: (typeof HACHIMON)[0]; // Added
}

/**
 * Generate the Standard Time schedule for the 12 Kimon Hours of a specific day.
 * Uses the correction factor at noon to approximate the day's shift.
 */
export function getDailySolarSchedule(
  date: Date,
  longitude: number,
  timezoneOffset: number = 9,
): KimonScheduleItem[] {
  // 1. Calculate correction at noon (representative for the day)
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  const { totalCorrection } = calculateSolarTime(
    noon,
    longitude,
    timezoneOffset,
  );

  // Calculate Day Stem and Branch for the specific day
  const dayStemIdx = getDayStemIndex(noon);
  const dayJunishiIdx = getDayJunishiIndex(noon); // Ensure this function exists or calculate it here

  // 2. Define Solar Hour boundaries (Starts)
  // Solar start times for the 12 branches: -1 (23:00 prev), 1, 3, 5, ... 21
  const solarStartHours = [-1, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];

  const schedule: KimonScheduleItem[] = []; // Initialize array
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  solarStartHours.forEach((hour, i) => {
    // Solar Start Date
    const solarStart = new Date(baseDate);
    solarStart.setHours(hour, 0, 0, 0);

    // Standard Start = Solar Start - Correction
    const startStandard = new Date(
      solarStart.getTime() - totalCorrection * 60000,
    );
    const endStandard = new Date(startStandard.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    // Get Name info
    const midSolar = new Date(solarStart);
    midSolar.setHours(midSolar.getHours() + 1); // Use getHours + 1 to handle date rollover safely
    const properties = getKimonHour(midSolar);

    // Calculate Hour Stem
    const stemIdx = getHourStemIndex(dayStemIdx, i);
    const stem = JIKKAN[stemIdx];

    // Calculate Kyusei & Hachimon
    // i corresponds to the branch index starting from Rat (0) to Boar (11)
    const kyusei = getHourlyKyusei(dayJunishiIdx, i);
    const hachimon = getHourlyHachimon(dayStemIdx, i, date.getMonth());

    schedule.push({
      ...properties,
      stemName: stem.name,
      stemKanji: stem.kanji,
      etoKanji: stem.kanji + properties.japanese,
      startStandard,
      endStandard,
      kyusei,
      hachimon,
    });
  });

  return schedule;
}

// --- Helper for Day Junishi ---
function getDayJunishiIndex(date: Date): number {
  /* ORIGINAL FORMULA (Preserved for reference):
  const base = new Date(2024, 0, 1); // Jan 1 2024
  const diff = date.getTime() - base.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return ((days % 12) + 12) % 12; 
  */
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
  const eightChar = lunar.getEightChar();
  const dayZhi = eightChar.getDayZhi();
  const JUNISHI = [
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
  return JUNISHI.indexOf(dayZhi);
}
