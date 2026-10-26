import { Solar } from "lunar-javascript";
import {
  TENCHUSATSU_GROUP_NAMES,
  type TenchusatsuGroupName,
} from "@/lib/tenchusatsuLite";

/**
 * 天中殺の月表（サーバー専用。lunar-javascript を使う）。
 *
 * 月の十二支は節入り（毎月 4〜8 日ごろ）で替わる。暦月の 20 日を代表点に
 * して、その月の大半を占める支を取る。年の支は立春で切る。
 */
export interface TimelineMonth {
  year: number;
  month: number;
  monthBranch: string;
  yearBranch: string;
}

export function monthBranches(
  startYear: number,
  startMonth: number,
  count: number,
): TimelineMonth[] {
  const out: TimelineMonth[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(startYear, startMonth - 1 + i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const lunar = Solar.fromYmdHms(y, m, 20, 12, 0, 0).getLunar();
    out.push({
      year: y,
      month: m,
      monthBranch: lunar.getMonthZhiExact(),
      yearBranch: lunar.getYearZhiExact(),
    });
  }
  return out;
}

/** 6 グループぶんの、各月が天中殺か（月・年） */
export function timelineByGroup(
  months: TimelineMonth[],
): Record<TenchusatsuGroupName, { monthVoid: boolean; yearVoid: boolean }[]> {
  return Object.fromEntries(
    TENCHUSATSU_GROUP_NAMES.map((g) => [
      g,
      months.map((t) => ({
        monthVoid: g.includes(t.monthBranch),
        yearVoid: g.includes(t.yearBranch),
      })),
    ]),
  ) as Record<
    TenchusatsuGroupName,
    { monthVoid: boolean; yearVoid: boolean }[]
  >;
}
