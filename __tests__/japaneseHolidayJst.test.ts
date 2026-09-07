import { describe, expect, it } from "vitest";
import { isJapaneseHoliday } from "@/utils/lunar";

/**
 * 祝日の判定を**日本時間の暦日**で行うこと。
 *
 * 同じファイルの getRokuyo / getLuckyDays は
 * `getZonedDateTimeFields(date, 9)` を通しているのに、ここだけ
 * `getFullYear()` などで**実行環境のタイムゾーン**を読んでいた。
 * 本番（Cloud Run）は UTC なので、絶対時刻を渡すと 0〜9 時が前日になる。
 *
 *     new Date("2026-01-01T00:30:00+09:00").getDate()  // UTC では 31
 *
 * 元日を「12/31」として見ていた（#456 と同じ罠）。曜日も 1 日ずれるので、
 * 振替休日と国民の休日の判定まで巻き添えになる。
 *
 * このテストは **TZ=UTC で走る**（vitest も CI も本番も UTC）。直す前の
 * 実装ではここが落ちる。
 */

const jst = (s: string) => new Date(`${s}+09:00`);

describe("祝日は日本時間の暦日で見る", () => {
  it("元日の 0 時台。UTC では前年の 12/31 に見える時刻", () => {
    expect(isJapaneseHoliday(jst("2026-01-01T00:30:00"))).toEqual({
      isHoliday: true,
      name: "元日",
    });
  });

  it("1 日じゅう同じ答えになる", () => {
    for (const h of ["00:00", "08:59", "09:01", "12:00", "23:59"]) {
      expect(isJapaneseHoliday(jst(`2026-05-05T${h}:00`)).name, h).toBe(
        "こどもの日",
      );
    }
  });

  it("祝日でない日を祝日にしない", () => {
    expect(isJapaneseHoliday(jst("2026-01-02T00:30:00")).isHoliday).toBe(false);
    expect(isJapaneseHoliday(jst("2026-05-07T12:00:00")).isHoliday).toBe(false);
  });

  it("ハッピーマンデー（曜日で決まる祝日）も 0 時台で正しい", () => {
    /* 2026 年の成人の日は 1 月 12 日（第 2 月曜） */
    expect(isJapaneseHoliday(jst("2026-01-12T00:30:00"))).toEqual({
      isHoliday: true,
      name: "成人の日",
    });
    expect(isJapaneseHoliday(jst("2026-01-12T23:30:00")).name).toBe("成人の日");
  });

  it("振替休日も 0 時台で正しい", () => {
    /* 2026-05-03（憲法記念日）は日曜。翌 5/4 はみどりの日なので、
       振替は 5/6（水）に回る */
    expect(isJapaneseHoliday(jst("2026-05-06T00:30:00")).isHoliday).toBe(true);
  });

  it("実行環境のタイムゾーンに依らない（UTC で走っていることの確認）", () => {
    /* この検査が意味を持つのは UTC で走っているときだけ。TZ が変わって
       空回りしていないかを見る */
    expect(new Date("2026-01-01T00:30:00+09:00").getDate()).toBe(31);
  });
});
