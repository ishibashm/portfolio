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

/**
 * Calculate True Solar Time (Local Solar Time).
 * @param date The standard time date object.
 * @param longitude Longitude of the location (e.g., 135.75 for Kyoto).
 * @param timezoneOffset Timezone offset in hours (e.g., 9 for JST).
 */
export function calculateSolarTime(
  date: Date,
  longitude: number,
  timezoneOffset: number = 9
): SolarTimeResult {
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
    9.87 * Math.sin(2 * B_rad) -
    7.53 * Math.cos(B_rad) -
    1.5 * Math.sin(B_rad);

  // 3. Longitude Correction (4 minutes per degree difference from standard meridian)
  const standardMeridian = timezoneOffset * 15; // 135 degrees for JST
  const longitudeDiff = longitude - standardMeridian;
  const longitudeCorrection = longitudeDiff * 4;

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

/**
 * Convert Solar Time to Kimon Tonkou / Twelve Earthly Branches Hour.
 */
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
    return { name: "Tiger", japanese: "寅", reading: "Tora", note: "Devils Gate (Kimon)" };
  } else if (hour >= 5 && hour < 7) {
    return { name: "Rabbit", japanese: "卯", reading: "U" };
  } else if (hour >= 7 && hour < 9) {
    return { name: "Dragon", japanese: "辰", reading: "Tatsu" };
  } else if (hour >= 9 && hour < 11) {
    return { name: "Snake", japanese: "巳", reading: "Mi" };
  } else if (hour >= 11 && hour < 13) {
    return { name: "Horse", japanese: "午", reading: "Uma" };
  } else if (hour >= 13 && hour < 15) {
    return { name: "Sheep", japanese: "未", reading: "Hitsuji", note: "Tenchusatsu (Void)" };
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
