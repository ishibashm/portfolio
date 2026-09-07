import { afterEach, describe, expect, it, vi } from "vitest";
import { contentYears, monthContentYears } from "@/lib/kigakuContent";
import { todayInJapan } from "@/utils/japanDate";

/**
 * 記事を用意する年は**日本時間で**決める。
 *
 * `new Date().getFullYear()` は実行環境のタイムゾーンを見る。ビルドは
 * UTC で走るので、元日の 0〜9 時（日本時間）に焼くと**前年**になり、
 * その年に必要な頁が 1 年ぶん足りないまま配られていた。
 *
 * このテストは TZ=UTC で走る（vitest も CI も本番も UTC）。直す前の
 * 実装ではここが落ちる。
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("記事を用意する年", () => {
  it("元日の 0 時台（日本時間）。UTC では前年に見える時刻", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:30:00+09:00"));

    /* この時刻の UTC は 2026-12-31。日本時間では 2027 年 */
    expect(new Date().getFullYear()).toBe(2026);
    expect(todayInJapan()).toBe("2027-01-01");

    expect(contentYears()).toEqual([2027, 2028, 2029]);
    expect(monthContentYears()).toEqual([2027, 2028]);
  });

  it("9 時を過ぎれば実行環境の年とも一致する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T12:00:00+09:00"));
    expect(contentYears()[0]).toBe(2027);
  });

  it("大晦日（日本時間）はまだ前の年", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:30:00+09:00"));
    expect(contentYears()).toEqual([2026, 2027, 2028]);
  });

  it("月盤は 2 年、年盤は 3 年（本数は変えていない）", () => {
    expect(contentYears()).toHaveLength(3);
    expect(monthContentYears()).toHaveLength(2);
  });
});
