import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 予報（30 日）・ヒートマップ（12 か月）の札と、総合スコアの曜日を
 * **日本時間**で読む。
 *
 * 直す前は `testDate.getMonth() + 1` / `getDate()` / `getDay()` で、端末の
 * タイムゾーンで読んでいた。評価時刻は日本時間の正午に固定してある
 * （boardInstant）ので、日本より西の端末では正午 JST が前日の夕方〜夜に
 * なり、札の日付が 1 日前に、曜日が 1 つ前にずれる。同じ行の dateStr は
 * toJapanDateString（日本時間）なので、行の中で日付と曜日が食い違う。
 * 生年月日・暦・盤と同じ「日本時間で読む」規則（CLAUDE.md 3 節）。
 *
 * 計算は SolarTimeClock の useMemo の中なので、ここは字面で固定する。
 * 旧挙動（端末のタイムゾーンで読む）に戻すと落ちる。
 */
describe("予報・ヒートマップ・総合スコアの日付は日本時間", () => {
  const code = readFileSync("src/components/SolarTimeClock.tsx", "utf8");
  const body = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("端末のタイムゾーンで読む getter を使っていない", () => {
    expect(body).not.toMatch(
      /testDate(?:Local)?\.get(?:Month|Date|Day|FullYear)\(\)/,
    );
  });

  it("札と曜日は JST の補助関数から出す", () => {
    expect(body).toMatch(/label: jstMonthDayLabel\(testDate\)/);
    expect(body).toMatch(/label: jstYearMonthLabel\(testDate\)/);
    expect(body).toMatch(/weekday: jstWeekday\(testDateLocal\)/);
    expect(body).toMatch(
      /function jstWeekday[\s\S]{0,200}getZonedDateTimeFields\(d, 9\)/,
    );
  });
});
