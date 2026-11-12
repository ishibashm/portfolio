import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Solar } from "lunar-javascript";
import { solarTermMonthAnchor } from "@/utils/ephemerisEngine";

/**
 * 公開記事 what-is-hinoeuma（丙午とは何か）の、計算に当たる部分を照合する
 * （2026-11-07 の監査。どのテストからも参照されていなかった）。
 *
 * - 丙午は 60 年周期。1906・1966・2026・2086 の年柱が丙午（立春の後の
 *   6 月 1 日で引く。年柱は立春の瞬間で切り替わる）
 * - 2026 年の立春は 2 月 4 日 5 時 02 分（JST。国立天文台の暦要項）。
 *   サイトの年の境目は solarTermMonthAnchor（太陽黄経 315 度の瞬間）で、
 *   記事は「公式暦と数分の差があり得る」と書いている → 5 分以内
 * - 立春の前（2/3）は乙巳、後（2/5）は丙午
 * - 出生数の差 462,723 人・約 25.4% 減は、記事の表の 2 つの値から計算で出る
 */

const md = readFileSync(
  join(__dirname, "../content/blog/what-is-hinoeuma.md"),
  "utf-8",
);

function yearPillar(y: number, m: number, d: number): string {
  const ec = Solar.fromYmdHms(y, m, d, 12, 0, 0).getLunar().getEightChar();
  return ec.getYearGan() + ec.getYearZhi();
}

describe("記事: 丙午とは何か", () => {
  it("丙午は 60 年周期（1906・1966・2026・2086）", () => {
    expect(md).toContain("1966年の次の丙午年は2026年、その次は2086年");
    for (const y of [1906, 1966, 2026, 2086]) {
      expect(yearPillar(y, 6, 1), String(y)).toBe("丙午");
    }
    /* 60 年の間に丙午は無い */
    for (let y = 1967; y < 2026; y++) {
      expect(yearPillar(y, 6, 1), String(y)).not.toBe("丙午");
    }
  });

  it("2026 年の立春は 2 月 4 日 5 時 02 分 JST（サイトの境目は 5 分以内）", () => {
    expect(md).toContain("2月4日5時02分（JST）");
    const official = Date.UTC(2026, 1, 4, 5 - 9, 2);
    /* solarTermMonthAnchor は「節入りの 15 日後」を返す（同じ節月の中を
       指す代表時刻）。節入りの瞬間はその 15 日前 */
    const site =
      solarTermMonthAnchor(new Date(Date.UTC(2026, 1, 10, 3, 0))).getTime() -
      15 * 86400000;
    expect(Math.abs(site - official) / 60000).toBeLessThanOrEqual(5);
    /* ライブラリの節気表（中国標準時）でも同じ時刻 */
    const t = Solar.fromYmdHms(2026, 2, 1, 12, 0, 0).getLunar().getJieQiTable()[
      "立春"
    ];
    const table = Date.UTC(
      t.getYear(),
      t.getMonth() - 1,
      t.getDay(),
      t.getHour() - 8,
      t.getMinute(),
    );
    expect(Math.abs(table - official) / 60000).toBeLessThanOrEqual(2);
  });

  it("立春より前は乙巳、以後は丙午", () => {
    expect(md).toContain("立春より前の生まれは前年の乙巳、立春以後は丙午");
    expect(yearPillar(2026, 2, 3)).toBe("乙巳");
    expect(yearPillar(2026, 2, 5)).toBe("丙午");
  });

  it("出生数の差と減少率は表の 2 つの値から出る", () => {
    expect(md).toContain("| 1965年 | 1,823,697人 |");
    expect(md).toContain("| 1966年 | 1,360,974人 |");
    const a = 1_823_697;
    const b = 1_360_974;
    expect(a - b).toBe(462_723);
    expect(md).toContain("462,723人");
    const pct = ((a - b) / a) * 100;
    expect(pct.toFixed(1)).toBe("25.4");
    expect(md).toContain("約25.4%の減少");
  });
});
