import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";
import { kanshiAt, solarTermsForYear } from "@/lib/kanshi";
import { JUNISHI } from "@/utils/tenchusatsuCore";
import { toJapanDateString } from "@/utils/japanDate";

/** 重い節気計算はサーバーのみ。月は節入り〜次の節入りとして表示する。 */
export function tenchusatsuTimeline(now = new Date()) {
  const today = toJapanDateString(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const published = new Set(calendarMonths(now).map(calendarMonthSlug));
  const months = Array.from({ length: 36 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const slug = calendarMonthSlug({ year: y, month: m });
    const start = solarTermsForYear(y).filter((t) => t.changesMonth)[m - 1];
    const end = solarTermsForYear(m === 12 ? y + 1 : y).filter(
      (t) => t.changesMonth,
    )[m % 12];
    return {
      slug,
      year: y,
      month: m,
      branch: JUNISHI[m % 12],
      start: start.atJst.slice(0, 10),
      end: end.atJst.slice(0, 10),
      href: published.has(slug) ? `/calendar/${slug}` : "/calendar",
    };
  });
  const current = kanshiAt(now);
  return {
    today,
    year,
    yearNumber: current.yearNumber,
    yearBranch: current.year.slice(-1),
    monthBranch: current.month.slice(-1),
    months,
  };
}
export type TenchusatsuTimeline = ReturnType<typeof tenchusatsuTimeline>;
