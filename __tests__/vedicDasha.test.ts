import { describe, expect, it } from "vitest";
import { VedicEngine } from "@/utils/vedicEngine";

/**
 * 出生時の大運（Mahadasha）は、出生の時点で月の宿（ナクシャトラ）の
 * 進みぶんだけ経過している。副運（Antardasha）を出生から積み上げると、
 * 実際には終わりに近い副運を最初の副運と言ってしまう。
 *
 * 独立に組んだ式（名目上の始まり = 出生 − progress × 年数）で出生直後の
 * 副運を求め、エンジンの答えと突き合わせる。
 */
const LORDS = [
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury",
];
const YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];

function expectedAntardashaAtBirth(nakshatraIndex: number, progress: number) {
  const m = nakshatraIndex % 9;
  const elapsedYears = progress * YEARS[m];
  let acc = 0;
  for (let i = 0; i < 9; i++) {
    const a = (m + i) % 9;
    acc += (YEARS[m] * YEARS[a]) / 120;
    if (elapsedYears < acc) return LORDS[a];
  }
  return LORDS[(m + 8) % 9];
}

describe("出生時の副運", () => {
  it("出生直後の副運は、大運の経過ぶんを足した位置になる", () => {
    const engine = new VedicEngine();
    // 何人か見て、宿の進みが半分を超える人が含まれるようにする
    const births = [
      "1985-03-03T12:00:00+09:00",
      "1990-05-15T15:30:00+09:00",
      "1999-12-31T23:00:00+09:00",
      "2003-07-07T07:07:00+09:00",
    ];
    let checkedLate = 0;
    for (const b of births) {
      const birth = new Date(b);
      const chart = engine.generateVedicChart(birth);
      const { index, longitudeRemaining } = chart.moonNakshatra;
      if (longitudeRemaining > 0.5) checkedLate++;
      const dasha = engine.calculateVimshottariDasha(
        birth,
        new Date(birth.getTime() + 24 * 3600 * 1000),
      );
      expect(dasha.antardasha, b).toBe(
        expectedAntardashaAtBirth(index, longitudeRemaining),
      );
    }
    expect(checkedLate).toBeGreaterThan(0);
  });
});
