/**
 * `/houi/[year]/[star]/[month]` が出す「いつからいつまでの月盤か」を、
 * 判定ツールと同じ**日本時間の正午**で決めることを固定する。
 *
 * 元の実装は代表点に `new Date(Date.UTC(y, m - 1, 20))` を使っていた。
 * これは 00:00 UTC ＝ **09:00 JST** で、節入りが 09:00〜12:00 JST に
 * 来る日は「正午には新しい月に入っているのに、09:00 にはまだ前の月」に
 * なる。走査はこの代表点から 1 日ずつ 24 時間だけ動かすので、境目が
 * 丸ごと 1 日ずれる。
 *
 * 結果として、記事の頁だけが「この月は 7 月 8 日から」と言い、
 * 同じ日を判定ツールに入れると 7 月 7 日から新しい月盤が出る、という
 * 食い違いが起きていた。site-spec 4.1「時刻はすべて日本時間の正午」の
 * 取りこぼし。#456 / #564 / #582 と同じ形の事故。
 */
import { describe, expect, it } from "vitest";

import { forecastAnchorMs } from "@/utils/boardInstant";
import { getClassicalMonthStar } from "@/utils/ephemerisEngine";
import { kigakuMonthRange } from "@/lib/kigakuContent";

/** UTC の Date を日本時間の暦日（YYYY-MM-DD）で読む */
function jstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

/** 旧実装。代表点が 09:00 JST だった頃の走査をそのまま写す。 */
function legacyStart(year: number, month: number): Date {
  const anchor = new Date(Date.UTC(year, month - 1, 20));
  const centerStar = getClassicalMonthStar(anchor);
  const start = new Date(anchor);
  while (
    getClassicalMonthStar(new Date(start.getTime() - 86400000)) === centerStar
  ) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  return start;
}

/**
 * 判定ツール側の答え。**日本時間の正午**で月星を引き、月星が変わる
 * 最初の日を返す。ツールはこの時刻で盤を出す（`forecastAnchorMs`）。
 */
function toolStart(year: number, month: number): Date {
  const anchor = new Date(
    forecastAnchorMs(new Date(Date.UTC(year, month - 1, 20))),
  );
  const centerStar = getClassicalMonthStar(anchor);
  const start = new Date(anchor);
  while (
    getClassicalMonthStar(new Date(start.getTime() - 86400000)) === centerStar
  ) {
    start.setTime(start.getTime() - 86400000);
  }
  return start;
}

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("kigakuMonthRange は日本時間の正午で境目を決める", () => {
  it("72 か月すべてで、判定ツールと同じ日から始まる", () => {
    const mismatch: string[] = [];
    for (const year of YEARS) {
      for (const month of MONTHS) {
        const { start } = kigakuMonthRange(year, month);
        const want = toolStart(year, month);
        if (jstDate(start) !== jstDate(want)) {
          mismatch.push(
            `${year}-${String(month).padStart(2, "0")}: 頁=${jstDate(start)} ツール=${jstDate(want)}`,
          );
        }
      }
    }
    expect(mismatch).toEqual([]);
  });

  it("代表点を 12:00 JST に置いたので、月星は正午のもの", () => {
    for (const year of YEARS) {
      for (const month of MONTHS) {
        const { start, centerStar } = kigakuMonthRange(year, month);
        // 始まりの日の正午には、もうその月の星になっている
        expect(getClassicalMonthStar(start)).toBe(centerStar);
        // その前日の正午は違う星
        expect(
          getClassicalMonthStar(new Date(start.getTime() - 86400000)),
        ).not.toBe(centerStar);
      }
    }
  });

  /**
   * 空回りするテストにしないための固定。
   *
   * 旧実装（09:00 JST 起点）に戻すと、下の 10 か月で始まりが 1 日
   * 遅くなる。ここが空になったら、この検証は何も見ていない。
   */
  it("旧実装は 72 か月中 10 か月で 1 日遅くなる", () => {
    const shifted: string[] = [];
    for (const year of YEARS) {
      for (const month of MONTHS) {
        const legacy = legacyStart(year, month);
        const want = toolStart(year, month);
        if (jstDate(legacy) !== jstDate(want)) {
          shifted.push(
            `${year}-${String(month).padStart(2, "0")} 旧=${jstDate(legacy)} 正=${jstDate(want)}`,
          );
        }
      }
    }
    expect(shifted).toEqual([
      "2026-07 旧=2026-07-08 正=2026-07-07",
      "2026-12 旧=2026-12-08 正=2026-12-07",
      "2027-02 旧=2027-02-05 正=2027-02-04",
      "2027-04 旧=2027-04-06 正=2027-04-05",
      "2028-03 旧=2028-03-06 正=2028-03-05",
      "2028-09 旧=2028-09-08 正=2028-09-07",
      "2029-01 旧=2029-01-06 正=2029-01-05",
      "2030-07 旧=2030-07-08 正=2030-07-07",
      "2030-12 旧=2030-12-08 正=2030-12-07",
      "2031-02 旧=2031-02-05 正=2031-02-04",
    ]);
  });

  /**
   * 終わりは「次の月の始まりの前日」。始まりがずれれば終わりもずれる
   * ので、隣り合う月がすき間なく繋がることも見ておく。
   */
  it("前の月の終わりと次の月の始まりが 1 日で繋がる", () => {
    for (const year of YEARS) {
      for (const month of MONTHS) {
        if (year === YEARS[YEARS.length - 1] && month === 12) continue;
        const cur = kigakuMonthRange(year, month);
        const next =
          month === 12
            ? kigakuMonthRange(year + 1, 1)
            : kigakuMonthRange(year, month + 1);
        expect(jstDate(new Date(cur.end.getTime() + 86400000))).toBe(
          jstDate(next.start),
        );
      }
    }
  });
});
