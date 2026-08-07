import { describe, expect, it } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
  type StarFrequency,
} from "@/utils/ephemerisEngine";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 2026-08-07 前後の実在しうる盤で、年・月・日に別々の星を置く。 */
function boards(year: StarFrequency, month: StarFrequency, day: StarFrequency) {
  return [generateBoard(year), generateBoard(month), generateBoard(day)] as const;
}

describe("12ヶ月表示の日盤除外 (ignoreDayLayer)", () => {
  const personal: StarFrequency = 6;
  const target = new Date("2026-08-07T03:00:00Z");

  it("日盤を外すと dayLayer がすべて SAFE になる", () => {
    const [y, m, d] = boards(6, 5, 7);
    const off = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional", true,
    );
    for (const dir of DIRS) {
      expect(off.dayLayer[dir], dir).toBe("SAFE");
    }
  });

  it("年盤・月盤の判定は日盤を外しても変わらない", () => {
    const [y, m, d] = boards(6, 5, 7);
    const on = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional", false,
    );
    const off = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional", true,
    );
    for (const dir of DIRS) {
      expect(off.yearLayer[dir], dir).toBe(on.yearLayer[dir]);
      expect(off.monthLayer[dir], dir).toBe(on.monthLayer[dir]);
    }
  });

  it("天道の方位は、日盤を外しても上書きが残る", () => {
    // 以前は 12 ヶ月表示側で finalVectors を組み直しており、この上書きが
    // 失われていた。地図が「大吉」の方位をヒートマップが「個人不調」と
    // 出す原因。
    const [y, m, d] = boards(6, 5, 7);
    const off = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional", true,
    );
    const tendo = off.tendoDirection;
    expect(tendo).toBeTruthy();
    if (!tendo) return;
    // 天道の方位に、本命殺系の凶が残っていないこと。
    expect(
      ["NOISE_HONMEI", "NOISE_TEKI", "NOISE_GETSUMEI", "NOISE_GETSUTEKI"],
    ).not.toContain(off.finalVectors[tendo]);
  });

  it("日盤を外して判定が悪化することはない", () => {
    // 日盤を外すのはノイズを減らす操作なので、悪くなる方位があってはならない。
    // 以前は 12 ヶ月表示側で finalVectors を組み直しており、天道の上書きが
    // 消えて「地図では大吉、ヒートマップでは個人不調」という逆転が起きていた。
    const severity = (s: string) =>
      ({
        OPTIMAL: 0,
        OPTIMAL_REGULAR: 1,
        SAFE: 2,
        WARNING: 3,
        NOISE_NODE: 4,
        NOISE_GETSUTEKI: 5,
        NOISE_GETSUMEI: 5,
        NOISE_TEKI: 6,
        NOISE_HONMEI: 6,
        NOISE_VOID: 7,
        NOISE_HA: 8,
        NOISE_ANKEN: 9,
        NOISE_GOU: 9,
      })[s] ?? 2;

    const [y, m, d] = boards(6, 5, 7);
    const on = calculateVectorCollision(
      personal, y, m, d, [], null, "DEFAULT", target, 139.6917,
      undefined, "traditional", false,
    );
    const [y2, m2, d2] = boards(6, 5, 7);
    const off = calculateVectorCollision(
      personal, y2, m2, d2, [], null, "DEFAULT", target, 139.6917,
      undefined, "traditional", true,
    );
    for (const dir of DIRS) {
      expect(
        severity(String(off.finalVectors[dir])),
        `${dir}: 日盤あり=${on.finalVectors[dir]} 日盤なし=${off.finalVectors[dir]}`,
      ).toBeLessThanOrEqual(severity(String(on.finalVectors[dir])));
    }
  });

  it("土用殺は日盤を外しても残る", () => {
    // 土用殺は盤ではなく暦から finalVectors に直接刻まれる。
    // 呼び出し側で finalVectors を組み直すとこれも消える。
    const [y, m, d] = boards(6, 5, 7);
    const off = calculateVectorCollision(
      personal, y, m, d, [], null, "DEFAULT", target, 139.6917,
      undefined, "traditional", true,
    );
    // 2026-08-07 は夏土用。土用殺の南西は、年盤・月盤が凶でなくても大凶。
    expect(off.yearLayer.SW).not.toContain("NOISE_GOU");
    expect(off.monthLayer.SW).not.toContain("NOISE_GOU");
    expect(off.finalVectors.SW).toBe("NOISE_GOU");
  });

  it("既定では日盤を外さない（後方互換）", () => {
    const [y, m, d] = boards(6, 5, 7);
    const explicit = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional", false,
    );
    const implicit = calculateVectorCollision(
      personal, y, m, d, [], null, "MIGRATION", target, 139.6917,
      undefined, "traditional",
    );
    for (const dir of DIRS) {
      expect(implicit.finalVectors[dir], dir).toBe(explicit.finalVectors[dir]);
      expect(implicit.dayLayer[dir], dir).toBe(explicit.dayLayer[dir]);
    }
  });
});
