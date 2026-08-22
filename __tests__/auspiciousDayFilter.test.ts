import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAY_FILTER,
  filterDays,
  isFiltering,
  monthLabel,
  monthsOf,
  type DayFilter,
  type FilterableDay,
} from "@/utils/auspiciousDayFilter";

/**
 * 吉日一覧の絞り込み。
 *
 * ここは**判定を作らない層**で、出す行を減らすだけ。だからテストも
 * 「どの行が残るか」だけを見る。
 */

function day(
  date: string,
  weekday: number,
  extra: Partial<FilterableDay> = {},
): FilterableDay {
  return { date, weekday, tags: [], blockedByTenchusatsu: false, ...extra };
}

const DAYS: FilterableDay[] = [
  day("2026-09-01", 2), // 火
  day("2026-09-05", 6, { tags: ["大安"] }), // 土
  day("2026-09-06", 0), // 日
  day("2026-09-12", 6, { blockedByTenchusatsu: true }), // 土・天中殺
  day("2026-10-03", 6, { tags: ["天赦日", "一粒万倍日"] }), // 土
  day("2026-10-07", 3), // 水
];

describe("既定", () => {
  it("既定では 1 件も落とさない", () => {
    /*
      このパネルは元々「天中殺で落ちる日も消さずに印を付ける」方針。
      落とした結果だけを見せると「天中殺を勘定に入れるかどうかで何日
      変わるのか」が分からなくなる。絞り込みを足しても、開いた直後の
      見え方は前と同じであること。
    */
    expect(filterDays(DAYS, DEFAULT_DAY_FILTER)).toEqual(DAYS);
  });

  it("既定は「絞り込んでいる」と数えない", () => {
    expect(isFiltering(DEFAULT_DAY_FILTER)).toBe(false);
  });

  it("天中殺を隠したら、絞り込みを変えたと数える", () => {
    expect(isFiltering({ ...DEFAULT_DAY_FILTER, hideBlocked: true })).toBe(
      true,
    );
  });
});

describe("曜日", () => {
  const weekend: DayFilter = { ...DEFAULT_DAY_FILTER, weekday: "weekend" };

  it("土日だけ", () => {
    expect(filterDays(DAYS, weekend).map((d) => d.date)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-12",
      "2026-10-03",
    ]);
  });

  it("平日だけ", () => {
    const r = filterDays(DAYS, { ...DEFAULT_DAY_FILTER, weekday: "weekday" });
    expect(r.map((d) => d.date)).toEqual(["2026-09-01", "2026-10-07"]);
  });

  it("天中殺を隠す指定と重ねても、条件が打ち消し合わない", () => {
    const r = filterDays(DAYS, { ...weekend, hideBlocked: true });
    expect(r.map((d) => d.date)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-10-03",
    ]);
  });
});

describe("縁起日", () => {
  it("天赦日・一粒万倍日・大安のどれかが付く日だけ", () => {
    const r = filterDays(DAYS, { ...DEFAULT_DAY_FILTER, luckyOnly: true });
    expect(r.map((d) => d.date)).toEqual(["2026-09-05", "2026-10-03"]);
  });

  it("知らない印は縁起日として数えない", () => {
    const r = filterDays([day("2026-09-01", 2, { tags: ["天道"] })], {
      ...DEFAULT_DAY_FILTER,
      luckyOnly: true,
    });
    expect(r).toEqual([]);
  });
});

describe("月", () => {
  it("選んだ月だけ", () => {
    const r = filterDays(DAYS, { ...DEFAULT_DAY_FILTER, month: "2026-10" });
    expect(r.map((d) => d.date)).toEqual(["2026-10-03", "2026-10-07"]);
  });

  it("候補がある月だけを選択肢にする（選んだ瞬間に空にならない）", () => {
    expect(monthsOf(DAYS)).toEqual(["2026-09", "2026-10"]);
  });

  it("月の表示は日本語", () => {
    expect(monthLabel("2026-09")).toBe("2026年9月");
  });
});

describe("重ねがけ", () => {
  it("すべての条件が同時に効く", () => {
    const r = filterDays(DAYS, {
      weekday: "weekend",
      luckyOnly: true,
      hideBlocked: true,
      month: "2026-10",
    });
    expect(r.map((d) => d.date)).toEqual(["2026-10-03"]);
  });

  it("該当が無ければ空で返る（黙って全件に戻らない）", () => {
    const r = filterDays(DAYS, {
      ...DEFAULT_DAY_FILTER,
      weekday: "weekday",
      luckyOnly: true,
    });
    expect(r).toEqual([]);
  });
});
