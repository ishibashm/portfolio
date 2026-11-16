import { toJapanDateString } from "@/utils/japanDate";

/**
 * 月別ページ（/calendar/YYYY-MM）の対象月。
 *
 * monthlyCalendar.ts から切り出してある。あちらは暦と天体の計算を読み込むので
 * 重く、クライアント側の /calendar から月の一覧だけを使いたいときに困る。
 * 一覧の定義は 1 か所に置きたいので、軽い側をここに分けた。
 */
export const CALENDAR_MONTH_COUNT = 18;

export interface CalendarMonthRef {
  year: number;
  month: number;
}

export function calendarMonths(now = new Date()): CalendarMonthRef[] {
  const today = toJapanDateString(now);
  const base = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1),
  );
  const out: CalendarMonthRef[] = [];
  for (let i = 0; i < CALENDAR_MONTH_COUNT; i++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + i);
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

export function calendarMonthSlug(c: CalendarMonthRef): string {
  return `${c.year}-${String(c.month).padStart(2, "0")}`;
}

/**
 * 月別ページを公開し始める月。これより前は作らない。
 *
 * /calendar/YYYY-MM は「今月から 18 か月」だけ静的生成していた。
 * 月が変わると先頭の月が窓から外れ、索引済みの頁が 404 になる
 * （2026-09 は個別に転送し、2026-10 は 2026-11 以降に 404 になった）。
 * 入口の一覧は従来どおり 18 か月のまま、頁そのものはこの開始月から残す。
 */
export const CALENDAR_MONTH_PAGES_START: CalendarMonthRef = {
  year: 2026,
  month: 1,
};

function compareMonth(a: CalendarMonthRef, b: CalendarMonthRef): number {
  return a.year - b.year || a.month - b.month;
}

function monthAfter(c: CalendarMonthRef): CalendarMonthRef {
  return c.month === 12
    ? { year: c.year + 1, month: 1 }
    : { year: c.year, month: c.month + 1 };
}

/** 実際に頁を出す月。入口の 18 か月窓より前の月も含む。 */
export function publishedCalendarMonths(now = new Date()): CalendarMonthRef[] {
  const upcoming = calendarMonths(now);
  const end = upcoming[upcoming.length - 1];
  if (!end) return [];
  const start = CALENDAR_MONTH_PAGES_START;
  if (compareMonth(end, start) < 0) return [];
  const out: CalendarMonthRef[] = [];
  for (let c = start; compareMonth(c, end) <= 0; c = monthAfter(c)) {
    out.push(c);
  }
  return out;
}

export function isPublishedCalendarMonth(
  year: number,
  month: number,
  now = new Date(),
): boolean {
  return publishedCalendarMonths(now).some(
    (c) => c.year === year && c.month === month,
  );
}
