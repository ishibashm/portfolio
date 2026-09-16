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

/**
 * 12 の節入りを全部、ライブラリの表と突き合わせる。
 *
 * 上の検査は立春 1 つだけを見ている。判定が使うのは
 * `solarTermMonthAnchor` で、**12 の節入りすべて**を自前の黄経から解く。
 * どれか 1 つの区切りが動けば、その節月に当たる人の月盤が丸ごと変わる。
 *
 * ライブラリの表は独立した実装なので、**突き合わせる相手として使える**
 * （時刻帯を +8 に直せば、同じ瞬間を指しているはず）。2026-09-16 の実測で
 * 2020〜2035 の 192 件すべてが **1 分以内**で一致した（最大は
 * 2026 年の芒種で 0.76 分）。
 *
 * 秒の丸めと二分探索の打ち切りでこのくらいはぶれる。**2 分を超えたら
 * 黄経のモデルかライブラリのどちらかが動いている。**
 */
describe("12 の節入りが、ライブラリの表と一致する", () => {
  /*
    節入りの名前と、その瞬間の太陽黄経。

    **表の鍵は簡体字。**中国のライブラリなので「啓蟄」ではなく「惊蛰」、
    「芒種」ではなく「芒种」で引く。日本語の字で引くと `undefined` が
    返り、**黙って 2 つ飛ばして 10 節入りしか比べない。**下の
    `expect(compared).toBe(192)` はそのための歯止め（実際に踏んだ）。
  */
  const TERMS: ReadonlyArray<readonly [string, string, number]> = [
    ["立春", "立春", 315],
    ["惊蛰", "啓蟄", 345],
    ["清明", "清明", 15],
    ["立夏", "立夏", 45],
    ["芒种", "芒種", 75],
    ["小暑", "小暑", 105],
    ["立秋", "立秋", 135],
    ["白露", "白露", 165],
    ["寒露", "寒露", 195],
    ["立冬", "立冬", 225],
    ["大雪", "大雪", 255],
    ["小寒", "小寒", 285],
  ];

  /** 目標黄経を跨ぐ瞬間。`around` の前後 20 日を二分探索する。 */
  function crossing(targetLon: number, around: number): number {
    const ahead = (t: number) =>
      (AstroEngine.getSolarLongitude(new Date(t)) - targetLon + 360) % 360 <
      180;
    let lo = around - 20 * 86400000;
    let hi = around + 20 * 86400000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (ahead(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  it("2020〜2035 の 192 件が 2 分以内で一致する（表は UTC+8）", () => {
    let compared = 0;
    let worst = 0;
    let worstLabel = "";
    for (let y = 2020; y <= 2035; y++) {
      const table = Solar.fromYmdHms(y, 6, 1, 12, 0, 0)
        .getLunar()
        .getJieQiTable();
      for (const [key, name, lon] of TERMS) {
        const t = table[key];
        expect(t, `${y} ${name}（${key}）が表に無い`).toBeTruthy();
        /* 表の数字は中国標準時。UTC+8 として瞬間に直す */
        const ref = Date.UTC(
          t.getYear(),
          t.getMonth() - 1,
          t.getDay(),
          t.getHour() - 8,
          t.getMinute(),
          t.getSecond(),
        );
        const diffMin = Math.abs(crossing(lon, ref) - ref) / 60000;
        if (diffMin > worst) {
          worst = diffMin;
          worstLabel = `${y} ${name}`;
        }
        compared++;
      }
    }
    expect(compared).toBe(192);
    expect(worst, `いちばんずれたのは ${worstLabel}`).toBeLessThan(2);
  });
});
