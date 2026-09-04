import { describe, it, expect } from "vitest";
import { Solar } from "lunar-javascript";
import { AstroEngine } from "@/utils/ephemerisEngine";

/**
 * lunar-javascript の節気表は**中国標準時（UTC+8）**で返る。
 *
 * 実測（2026-09-04）。太陽黄経 315 度を二分探索で解いた絶対時刻を日本時間で
 * 出すと、ライブラリの表よりちょうど 1 時間あとになる。
 *
 *   2024  エンジン 17:26  表 16:27
 *   2025  エンジン 23:10  表 22:10
 *   2026  エンジン  5:01  表  4:02
 *   2027  エンジン 10:46  表  9:46
 *   2028  エンジン 16:31  表 15:31
 *
 * ## いまは実害が無い
 *
 * **判定は表を使っていない。**`solarTermMonthAnchor` が黄経から解くので、
 * 時刻帯に依存しない。表を読むのは `baziEngine.getSolarTerms()` だけで、
 * その結果（`BaziResult.solarTerms`）は画面にも API 応答にも出ていない。
 *
 * ## それでも固定する理由
 *
 * この値を**そのまま日本時間として画面に出した瞬間**、1 時間早い立春が
 * 出る。#456（Solar.fromDate が実行環境の時刻帯で日を読む）と同じ形の罠で、
 * あちらは 9 時間ずれて日盤の 37.3% が狂った。ここは 1 時間なので、
 * ずれても「なんとなく合っている」ように見えるぶん質が悪い。
 *
 * ライブラリの更新でこの前提が変わったときも、ここで気付ける。
 */

/** 立春（黄経 315 度）の瞬間。絶対時刻なので時刻帯に依存しない。 */
function risshun(year: number): Date {
  let lo = Date.UTC(year, 0, 20);
  let hi = Date.UTC(year, 1, 20);
  const ahead = (t: number) =>
    (AstroEngine.getSolarLongitude(new Date(t)) - 315 + 360) % 360 < 180;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/** ライブラリの節気表が言う立春を、書かれている数字のまま Date にする。 */
function tableRisshun(year: number): { utcAsIfJst: number; text: string } {
  const t = Solar.fromYmdHms(year, 2, 1, 12, 0, 0).getLunar().getJieQiTable()[
    "立春"
  ];
  /* 表の数字を「日本時間」と読んだ場合の瞬間。ここがずれの正体 */
  const utcAsIfJst = Date.UTC(
    t.getYear(),
    t.getMonth() - 1,
    t.getDay(),
    t.getHour() - 9,
    t.getMinute(),
  );
  return {
    utcAsIfJst,
    text: `${t.getYear()}-${t.getMonth()}-${t.getDay()} ${t.getHour()}:${String(t.getMinute()).padStart(2, "0")}`,
  };
}

describe("節気表の時刻帯", () => {
  const YEARS = [2024, 2025, 2026, 2027, 2028];

  it("表を日本時間と読むと、ちょうど 1 時間ずれる（表は UTC+8）", () => {
    for (const y of YEARS) {
      const diffMin =
        (risshun(y).getTime() - tableRisshun(y).utcAsIfJst) / 60000;
      /* 秒の丸めで 1 分ぶれる。59〜61 分に収まっていれば「1 時間」 */
      expect(diffMin, `${y}: 表 ${tableRisshun(y).text}`).toBeGreaterThan(59);
      expect(diffMin, `${y}: 表 ${tableRisshun(y).text}`).toBeLessThan(61);
    }
  });

  it("エンジンの立春は 2 月 3 日か 4 日（日本時間）", () => {
    for (const y of YEARS) {
      const day = Number(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Tokyo",
          day: "numeric",
        }).format(risshun(y)),
      );
      expect([3, 4], `${y}`).toContain(day);
    }
  });
});
