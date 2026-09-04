import { describe, it, expect } from "vitest";
import { relativeTime } from "@/components/news/NewsCards";

/**
 * カードの相対時刻。「3 時間前」の境目は画面でしか見えないので固定する。
 */

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("相対時刻", () => {
  it("1 時間未満は分", () => {
    expect(relativeTime(ago(0), NOW)).toBe("0 分前");
    expect(relativeTime(ago(59 * 60_000), NOW)).toBe("59 分前");
  });

  it("1 日未満は時間", () => {
    expect(relativeTime(ago(60 * 60_000), NOW)).toBe("1 時間前");
    expect(relativeTime(ago(23 * 3_600_000), NOW)).toBe("23 時間前");
  });

  it("1 週間未満は日", () => {
    expect(relativeTime(ago(24 * 3_600_000), NOW)).toBe("1 日前");
    expect(relativeTime(ago(6 * 86_400_000), NOW)).toBe("6 日前");
  });

  it("1 週間以上は日本時間の日付に落とす", () => {
    // 2026-08-28 12:00 UTC = 8/28 21:00 JST
    expect(relativeTime(ago(7 * 86_400_000), NOW)).toBe("8/28");
  });

  it("未来の時刻を負にしない（配信元の時計が進んでいることがある）", () => {
    expect(relativeTime(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe(
      "0 分前",
    );
  });

  it("読めない日付は空", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});
