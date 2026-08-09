import { getRokuyo, getLuckyDays } from "@/utils/lunar";
import { AstroEngine, getCurrentZodiac } from "@/utils/ephemerisEngine";
import {
  kigakuMonthRange,
  getMonthDirections,
  STAR_NAMES,
  STARS,
  DIRECTION_LABELS,
  type DirectionVerdict,
} from "./kigakuContent";
import { toJapanDateString } from "@/utils/japanDate";
import { calendarMonths, calendarMonthSlug } from "./calendarMonths";

/**
 * 「その月に引越しへ向く日」を月単位でまとめる。
 *
 * 既存の記事は本命星 × 年 × 月で引く早見表になっていて、「2026年9月に
 * 引越すなら何日がいいか」という、日付を起点にした探し方に応える面が無い。
 * 日取りの検索は月が変わるたびに繰り返し発生するのに、その入口が
 * カレンダー画面（操作しないと何も出ない）しか無かった。
 *
 * ここで扱うのは暦だけで決まる情報に限る。
 *   六曜（大安・友引）／天赦日・一粒万倍日／土用の期間
 * これらは誰にとっても同じなので、静的なページにできる。
 *
 * 一方、本命殺・天中殺は生年月日で変わるので日付の良し悪しには混ぜない。
 * 方位は本命星ごとに違うため、9 星ぶんを並べて出す。
 */

export interface CalendarDay {
  /** YYYY-MM-DD（日本時間） */
  date: string;
  day: number;
  /** 0=日曜 */
  weekday: number;
  rokuyo: string;
  /** 天赦日・一粒万倍日など */
  luckyLabels: string[];
  /** 土用の期間内か */
  inDoyou: boolean;
  /** 土用でも障りが無いとされる間日 */
  isMabi: boolean;
}

export interface StarDirections {
  star: number;
  starName: string;
  /** 吉方位の日本語表記 */
  good: string[];
  /** 避けたい方位（名称つき） */
  bad: { jp: string; label: string }[];
}

export interface MonthlyCalendar {
  year: number;
  month: number;
  /** 節入りで区切った、この月の盤が効く期間 */
  termStart: string;
  termEnd: string;
  centerStar: number;
  days: CalendarDay[];
  /** 引越しに向く日（大安 or 天赦日/一粒万倍日で、土用の障りが無い日） */
  recommended: CalendarDay[];
  starDirections: StarDirections[];
  doyou: { start: string; end: string } | null;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 六曜からローマ字の併記を落とす。
 * ROKUYO は "大安 (Taian)" の形で持っており、画面では日本語だけでよい。
 */
function plainRokuyo(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_JP[weekday] ?? "";
}

/** 暦月の日数。 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** その日の正午（日本時間）。暦の判定は日単位なので正午を代表点にする。 */
function noonJst(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 3)); // 12:00 JST
}

export function buildMonthlyCalendar(
  year: number,
  month: number,
): MonthlyCalendar {
  const { start, end, centerStar } = kigakuMonthRange(year, month);

  const days: CalendarDay[] = [];
  let doyouStart: string | null = null;
  let doyouEnd: string | null = null;

  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = noonJst(year, month, d);
    const zodiac = getCurrentZodiac(date);
    const doyou = doyouStateOf(date, zodiac.dayZodiac);
    const iso = toJapanDateString(date);

    if (doyou.inDoyou) {
      if (!doyouStart) doyouStart = iso;
      doyouEnd = iso;
    }

    days.push({
      date: iso,
      day: d,
      weekday: new Date(Date.UTC(year, month - 1, d)).getUTCDay(),
      rokuyo: plainRokuyo(getRokuyo(date)),
      luckyLabels: getLuckyDays(date).labels,
      inDoyou: doyou.inDoyou,
      isMabi: doyou.isMabi,
    });
  }

  // 引越しに向く日。
  //
  // 一粒万倍日だけを条件にすると、仏滅や赤口の日まで「向く日」に入ってしまう
  // （実測で 2026-09-19 の仏滅が挙がっていた）。六曜で避けられる日を先に落とし、
  // そのうえで暦の吉が乗っている日を挙げる。土用は間日以外を外す。
  const AVOID_ROKUYO = ["仏滅", "赤口"];
  const recommended = days.filter((d) => {
    if (AVOID_ROKUYO.includes(d.rokuyo)) return false;
    if (d.inDoyou && !d.isMabi) return false;
    return d.rokuyo === "大安" || d.luckyLabels.length > 0;
  });

  const starDirections: StarDirections[] = STARS.map((star) => {
    const { verdicts } = getMonthDirections(year, month, star);
    return {
      star,
      starName: STAR_NAMES[star],
      good: verdicts.filter((v) => v.kind === "good").map((v) => v.jp),
      bad: verdicts
        .filter((v) => v.kind === "bad")
        .map((v: DirectionVerdict) => ({ jp: v.jp, label: v.label })),
    };
  });

  return {
    year,
    month,
    termStart: toJapanDateString(start),
    termEnd: toJapanDateString(end),
    centerStar,
    days,
    recommended,
    starDirections,
    doyou: doyouStart && doyouEnd ? { start: doyouStart, end: doyouEnd } : null,
  };
}

/**
 * 土用の判定。
 *
 * 立春・立夏・立秋・立冬の前 18 日間が土用で、土いじりや移転の基礎に
 * 関わることを避けるとされる。ただし間日は障りが無いとする。
 * ephemerisEngine の内部実装と同じ規則をここでも使う（あちらは
 * calculateVectorCollision の中にあり、単体で呼べないため）。
 */
function doyouStateOf(
  date: Date,
  dayZodiac: string,
): { inDoyou: boolean; isMabi: boolean } {
  const sunLon = AstroEngine.getSolarLongitude(date);
  // 土用は各季の終わり 18 度ぶん。立春315/立夏45/立秋135/立冬225 の手前。
  const RANGES: { from: number; to: number; mabi: string[] }[] = [
    { from: 297, to: 315, mabi: ["巳", "午", "酉"] }, // 冬土用
    { from: 27, to: 45, mabi: ["卯", "辰", "申"] }, // 春土用
    { from: 117, to: 135, mabi: ["卯", "辰", "申"] }, // 夏土用
    { from: 207, to: 225, mabi: ["未", "酉", "亥"] }, // 秋土用
  ];
  for (const r of RANGES) {
    const inRange =
      r.from < r.to
        ? sunLon >= r.from && sunLon < r.to
        : sunLon >= r.from || sunLon < r.to;
    if (inRange) {
      return { inDoyou: true, isMabi: r.mabi.includes(dayZodiac) };
    }
  }
  return { inDoyou: false, isMabi: false };
}

export function directionListLabel(list: string[]): string {
  return list.length > 0 ? list.join("・") : "なし";
}

export { DIRECTION_LABELS, calendarMonths, calendarMonthSlug };
