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
