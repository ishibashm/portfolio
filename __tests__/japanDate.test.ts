import { describe, expect, it } from "vitest";
import { todayInJapan, toJapanDateString } from "@/utils/japanDate";

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
