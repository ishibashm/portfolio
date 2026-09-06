import { describe, expect, it } from "vitest";
import {
  daysAgoInJapan,
  todayInJapan,
  toJapanDateString,
  normalizeBirthDateTimeLocal,
} from "@/utils/japanDate";

describe("日本時間の暦日", () => {
  it("UTC で日付が変わっても、日本時間ではまだ翌日", () => {
    // 2026-08-06T22:35Z = 日本時間 2026-08-07 07:35。
    // toISOString().split("T")[0] だと 2026-08-06 になる（これが不具合）。
    const t = new Date("2026-08-06T22:35:00Z");
    expect(t.toISOString().split("T")[0]).toBe("2026-08-06");
    expect(todayInJapan(t)).toBe("2026-08-07");
  });

  it("日本時間の 0 時〜9 時がすべて当日になる", () => {
    // 日本時間 2026-08-07 の 00:00 と 08:59 は、UTC では前日。
    expect(toJapanDateString(new Date("2026-08-06T15:00:00Z"))).toBe(
      "2026-08-07",
    );
    expect(toJapanDateString(new Date("2026-08-06T23:59:00Z"))).toBe(
      "2026-08-07",
    );
    // 日本時間 09:00 以降は UTC と同じ日付。
    expect(toJapanDateString(new Date("2026-08-07T00:00:00Z"))).toBe(
      "2026-08-07",
    );
  });

  it("日本時間で日付が変わる瞬間の前後", () => {
    expect(toJapanDateString(new Date("2026-08-06T14:59:59Z"))).toBe(
      "2026-08-06",
    );
    expect(toJapanDateString(new Date("2026-08-06T15:00:00Z"))).toBe(
      "2026-08-07",
    );
  });

  it("常に YYYY-MM-DD で、月日は 0 埋めする", () => {
    expect(toJapanDateString(new Date("2026-01-05T00:00:00Z"))).toBe(
      "2026-01-05",
    );
    expect(toJapanDateString(new Date("2026-12-31T14:00:00Z"))).toBe(
      "2026-12-31",
    );
    // 年をまたぐ
    expect(toJapanDateString(new Date("2026-12-31T15:00:00Z"))).toBe(
      "2027-01-01",
    );
  });

  it("date 入力にそのまま入れられる形", () => {
    expect(todayInJapan()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * 生年月日 → datetime-local。**Date に通すと端末の場所で日付が変わる**
 * 罠を塞いだ関数。日付だけの値は Date に通さないことが要点。
 */
describe("normalizeBirthDateTimeLocal", () => {
  it("日付だけなら正午を付ける（Date に通さない）", () => {
    expect(normalizeBirthDateTimeLocal("1990-05-15")).toBe("1990-05-15T12:00");
  });

  it("時差の指定が無い時刻つきは、そのまま先頭 16 文字", () => {
    expect(normalizeBirthDateTimeLocal("1990-05-15T09:30")).toBe(
      "1990-05-15T09:30",
    );
    expect(normalizeBirthDateTimeLocal("1990-05-15T09:30:45")).toBe(
      "1990-05-15T09:30",
    );
  });

  it("時差の指定があれば日本時間に直す（UTC 15:00 の前日 → JST 翌日 0 時）", () => {
    expect(normalizeBirthDateTimeLocal("1990-05-14T15:00:00Z")).toBe(
      "1990-05-15T00:00",
    );
    expect(normalizeBirthDateTimeLocal("1990-05-15T12:00:00+09:00")).toBe(
      "1990-05-15T12:00",
    );
  });

  it("空と壊れた値は空", () => {
    expect(normalizeBirthDateTimeLocal("")).toBe("");
    expect(normalizeBirthDateTimeLocal("not a date")).toBe("");
  });
});

/**
 * 集計の窓を切る基準。metrics/summary は JST 0 時の瞬間から n 日引いて
 * toISOString で読んでいたので、UTC の日付（＝ 1 日前）になっていた。
 * 「昨日」が一昨日、「直近 30 日」が 31 日。
 */
describe("daysAgoInJapan", () => {
  const now = new Date("2026-09-06T12:00:00+09:00");

  it("JST の暦日で n 日前を返す", () => {
    expect(daysAgoInJapan(0, now)).toBe("2026-09-06");
    expect(daysAgoInJapan(1, now)).toBe("2026-09-05");
    expect(daysAgoInJapan(29, now)).toBe("2026-08-08");
  });

  it("JST の 0 時台でも前日に落ちない（UTC で読んだときの罠）", () => {
    // JST 9/6 0:30 = UTC 9/5 15:30。UTC で読むと「今日」が 9/5 になる
    const smallHours = new Date("2026-09-06T00:30:00+09:00");
    expect(daysAgoInJapan(0, smallHours)).toBe("2026-09-06");
    expect(daysAgoInJapan(1, smallHours)).toBe("2026-09-05");
  });

  it("旧実装（JST 0 時から引いて UTC で読む）と 1 日ずれることを固定する", () => {
    const legacy = (days: number) => {
      const todayJst = new Date(`2026-09-06T00:00:00+09:00`);
      return new Date(todayJst.getTime() - days * 86_400_000)
        .toISOString()
        .slice(0, 10);
    };
    expect(legacy(1)).toBe("2026-09-04"); // 一昨日になっていた
    expect(daysAgoInJapan(1, now)).toBe("2026-09-05");
  });
});
