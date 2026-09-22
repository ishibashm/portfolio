import { getRokuyo, getLuckyDays, plainRokuyo } from "@/utils/lunar";
import {
  DOYOU_MABI,
  doyouTypeOfDay,
  getCurrentZodiac,
  getUpcomingDoyouPeriod,
} from "@/utils/ephemerisEngine";
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
  let firstDoyouDay: number | null = null;

  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = noonJst(year, month, d);
    const zodiac = getCurrentZodiac(date);
    const doyou = doyouStateOf(date, zodiac.dayZodiac);
    const iso = toJapanDateString(date);

    if (doyou.inDoyou && firstDoyouDay === null) firstDoyouDay = d;

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
    doyou: doyouPeriodOf(year, month, firstDoyouDay),
  };
}

/**
 * その月に掛かる土用の**本当の**始まりと終わり。
 *
 * 以前は月内の日を回しながら最初と最後の土用の日を拾っていたので、期間が
 * 暦月で切れていた。土用は 4 つとも月をまたぐ（冬土用は 1/17 頃〜2/3）ので
 * 常に短く出て、/calendar/2026-01 は「1/18〜1/31」、/calendar/2026-02 は
 * 「2/1〜2/3」と書いていた。ephemerisEngine の getUpcomingDoyouPeriod は
 * 月の外まで走査して期間を返すので、月内の最初の土用の日から引く。
 */
function doyouPeriodOf(
  year: number,
  month: number,
  firstDoyouDay: number | null,
): { start: string; end: string } | null {
  if (firstDoyouDay === null) return null;
  const period = getUpcomingDoyouPeriod(noonJst(year, month, firstDoyouDay));
  return period ? { start: period.start, end: period.end } : null;
}

/**
 * 土用の判定。
 *
 * 立春・立夏・立秋・立冬の前 18 日間が土用で、土いじりや移転の基礎に
 * 関わることを避けるとされる。ただし間日は障りが無いとする。
 * 規則は ephemerisEngine の `doyouTypeOfDay` ただ 1 つ。
 */
function doyouStateOf(
  date: Date,
  dayZodiac: string,
): { inDoyou: boolean; isMabi: boolean } {
  /*
    区切りも間日の表も ephemerisEngine から引く。以前はここに手で写して
    いて、間日は冬に春の表・春に夏の表が入り、黄経を見る時刻も帯
    （getUpcomingDoyouPeriod）と違っていた。同じ頁の帯と行が土用の
    入り・明けで 1 日食い違っていた（#1493）。
  */
  const type = doyouTypeOfDay(date);
  if (!type) return { inDoyou: false, isMabi: false };
  return { inDoyou: true, isMabi: DOYOU_MABI[type].includes(dayZodiac) };
}

export function directionListLabel(list: string[]): string {
  return list.length > 0 ? list.join("・") : "なし";
}

export { DIRECTION_LABELS, calendarMonths, calendarMonthSlug };
