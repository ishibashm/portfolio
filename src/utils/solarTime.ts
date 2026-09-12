import { getHourlyKyusei, KYUSEI } from "./kigaku";
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

export function getLongitudeCorrection(
  lon: number,
  timezoneOffsetHours: number,
): number {
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
  /*
    標準時。既定は日本標準時（UTC+9、標準子午線 135 度）。

    以前の既定は `Math.round(経度 / 15)` で、経度からタイムゾーンを
    推測していた。日本は全国が JST なのに、経度 127.5 度未満（石垣・
    宮古島）は 8、142.5 度以上（帯広・釧路・根室）は 10 と推測され、
    **真太陽時が 60 分ずれていた。**盤の評価時刻（boardInstant）は 9 を
    明示していたが、時計（SolarTimeClock の setSolarData）は既定のまま
    だった。海外の出生地はこのサイトでは扱わない（生年月日も日本時間で
    読む。utils/japanDate）ので、既定を 9 にする。
    見張りは __tests__/solarTimeJstClock.test.ts。
  */
  timezoneOffset: number = 9,
): SolarTimeResult {
  const tzOffset = timezoneOffset;

  // 1. Day of Year (n)
  // 年の頭は**その標準時**で取る。`new Date(year, 0, 0)` は実行環境の
  // タイムゾーンで年を読むので、UTC の環境では 1/1 の 0〜9 時が前年に
  // なる（均時差が 1 日ぶんずれる。差は 0.5 分未満だが、日本時間で
  // 揃える決まりに反する）。
  const fields = getZonedDateTimeFields(date, tzOffset);
  const start = Date.UTC(fields.year, 0, 0) - tzOffset * 3600000;
  const diff = date.getTime() - start;
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

  // Override toJSON to prevent the "Z" suffix leak and capture local tzOffset
  solarTime.toJSON = () => {
    const pad = (n: number, w: number = 2) => String(n).padStart(w, "0");
    const absOffset = Math.abs(tzOffset);
    const offsetHours = Math.floor(absOffset);
    const offsetMinutes = Math.round((absOffset - offsetHours) * 60);
    const sign = tzOffset >= 0 ? "+" : "-";
    const tzString =
      tzOffset === 0 ? "Z" : `${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;

    // Shift the date based on tzOffset to build timezone-independent UTC components
    const localTimeMs = solarTime.getTime() + tzOffset * 3600000;
    const localDate = new Date(localTimeMs);

    return `${localDate.getUTCFullYear()}-${pad(localDate.getUTCMonth() + 1)}-${pad(localDate.getUTCDate())}T${pad(localDate.getUTCHours())}:${pad(localDate.getUTCMinutes())}:${pad(localDate.getUTCSeconds())}.${pad(localDate.getUTCMilliseconds(), 3)}${tzString}`;
  };

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
  /*
    刻は**日本時間**で切る。`getHours()` は実行環境のタイムゾーンで
    読むので、日本のブラウザでは JST と一致して見えないが、日本より
    西の端末と CI（UTC）では 9 時間ずれた刻が出ていた（CLAUDE.md 3 節の
    `Solar.fromDate` と同じ罠）。渡される solarDt は「真太陽時ぶん
    ずらした瞬間」なので、その JST の時刻を読めば真太陽時の時刻になる。
  */
  const hour = getZonedDateTimeFields(solarDt, 9).hours;

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
  kyusei: (typeof KYUSEI)[0];
  /*
    八門（hachimon）はここに無い。以前は getHourlyHachimon の値を持たせて
    いたが、あれは盤を組まず刻の順に門を回すだけの仮実装だった（#1238）。
    判定（lib/timePhase）と表示（SolarTimeTable・HomePortal）から外した
    あと、型ごと消した。戻すなら奇門遁甲の時盤を実際に組んでから。
  */
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
  /*
    日の頭と正午は**その標準時**で取る。以前は `setHours` で実行環境の
    タイムゾーンの 0 時・12 時を使っていたので、日本のブラウザ以外
    （日本より西の端末、CI の UTC）では 9 時間ずれた一覧になっていた。
  */
  const f = getZonedDateTimeFields(date, timezoneOffset);
  const midnightMs =
    Date.UTC(f.year, f.month - 1, f.day) - timezoneOffset * 3600000;

  // 1. Calculate correction at noon (representative for the day)
  const noon = new Date(midnightMs + 12 * 3600000);
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

  solarStartHours.forEach((hour, i) => {
    // Solar Start Date（その標準時の 0 時からの時間）
    const solarStart = new Date(midnightMs + hour * 3600000);

    // Standard Start = Solar Start - Correction
    const startStandard = new Date(
      solarStart.getTime() - totalCorrection * 60000,
    );
    const endStandard = new Date(startStandard.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    // Get Name info
    const midSolar = new Date(solarStart.getTime() + 3600000);
    const properties = getKimonHour(midSolar);

    // Calculate Hour Stem
    const stemIdx = getHourStemIndex(dayStemIdx, i);
    const stem = JIKKAN[stemIdx];

    // 時盤の九星。i は子(0)〜亥(11) の十二支の番号
    const kyusei = getHourlyKyusei(dayJunishiIdx, i);

    schedule.push({
      ...properties,
      stemName: stem.name,
      stemKanji: stem.kanji,
      etoKanji: stem.kanji + properties.japanese,
      startStandard,
      endStandard,
      kyusei,
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
