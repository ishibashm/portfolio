/**
 * 吉日一覧の絞り込み。
 *
 * 12 ヶ月で走査すると、1 方位で 99 日、8 方位で 500 日を超える表が出る
 * （実測。北西だけで 99 日）。**日付が並んでいるだけで、そこから
 * 「いつにするか」を選べない**と利用者から指摘を受けている。
 *
 * 実際に日を決めるときに効く軸だけを置く。引越し業者の予約は土日に偏る、
 * 縁起日を優先したい人がいる、天中殺の日は結局選べない——この 3 つ。
 *
 * **判定は作らない。**候補の並びも段階も変えず、出す行を減らすだけ。
 */

/** 絞り込みの対象になる 1 日ぶん。必要な項目だけを要求する。 */
export interface FilterableDay {
  /** YYYY-MM-DD */
  date: string;
  /** 0=日曜。`Date.getDay()` と同じ。 */
  weekday: number;
  tags: string[];
  blockedByTenchusatsu: boolean;
}

export type WeekdayFilter = "all" | "weekend" | "weekday";

export interface DayFilter {
  weekday: WeekdayFilter;
  /** 天赦日・一粒万倍日・大安のいずれかが付く日だけにする。 */
  luckyOnly: boolean;
  /** 天中殺で塞がる日を隠す。 */
  hideBlocked: boolean;
  /** "all" か "YYYY-MM"。 */
  month: string;
}

export const DEFAULT_DAY_FILTER: DayFilter = {
  weekday: "all",
  luckyOnly: false,
  /*
    **既定では隠さない。**このパネルは元々「天中殺で落ちる日も消さずに
    印を付ける」方針で作られている（`AuspiciousDayFinder` の冒頭）。
    落とした結果だけを見せると「天中殺を勘定に入れるかどうかで何日
    変わるのか」が分からなくなり、その判断自体ができなくなる。
    隠したい人が自分で選ぶ。
  */
  hideBlocked: false,
  month: "all",
};

/** 縁起日として扱う印。判定には使わない、暦の飾り。 */
export const LUCKY_TAGS = ["天赦日", "一粒万倍日", "大安"] as const;

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function filterDays<T extends FilterableDay>(
  days: T[],
  filter: DayFilter,
): T[] {
  return days.filter((d) => {
    if (filter.hideBlocked && d.blockedByTenchusatsu) return false;
    if (filter.weekday === "weekend" && !isWeekend(d.weekday)) return false;
    if (filter.weekday === "weekday" && isWeekend(d.weekday)) return false;
    if (
      filter.luckyOnly &&
      !d.tags.some((t) => LUCKY_TAGS.includes(t as never))
    )
      return false;
    if (filter.month !== "all" && monthOf(d.date) !== filter.month)
      return false;
    return true;
  });
}

/**
 * 一覧に出ている月。絞り込みの選択肢に使う。
 *
 * 走査期間から機械的に作らない。**その方位に候補がある月だけ**を出す。
 * 候補が 1 日も無い月を選べるようにすると、選んだ瞬間に空になる。
 */
export function monthsOf(days: FilterableDay[]): string[] {
  return [...new Set(days.map((d) => monthOf(d.date)))].sort();
}

/** 「YYYY-MM」を「YYYY年M月」に。 */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

/** 既定から変えているか。「絞り込みを外す」を出すかの判断に使う。 */
export function isFiltering(filter: DayFilter): boolean {
  return (
    filter.weekday !== DEFAULT_DAY_FILTER.weekday ||
    filter.luckyOnly !== DEFAULT_DAY_FILTER.luckyOnly ||
    filter.hideBlocked !== DEFAULT_DAY_FILTER.hideBlocked ||
    filter.month !== DEFAULT_DAY_FILTER.month
  );
}
