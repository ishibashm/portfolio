import { describe, expect, it } from "vitest";
import { COMPASS_DIRECTIONS } from "@/utils/directionGeo";
import {
  AUSPICIOUS_YOUXING,
  EAST_GROUP,
  WEST_GROUP,
  fengShuiFor,
  honmeiGua,
  honmeiYearFor,
  readFengShui,
  type Gua,
  type Sex,
} from "@/utils/fengShuiEngine";

/**
 * 八宅の表を固定する。
 *
 * **表は手で写したもの**なので、写し間違いを検算で捕まえる。いちばん強い
 * 検算は「東四命の吉方位は東・南東・南・北の 4 つ、西四命は西・北西・
 * 北東・南西の 4 つ」という性質。1 か所でも写し間違えるとここが落ちる。
 *
 * この層は九星気学とは独立していて、**足し合わせない。**評価に入れるかは
 * 利用者が選ぶ。
 */

const ALL_GUA: Gua[] = [1, 2, 3, 4, 6, 7, 8, 9];

describe("本命卦", () => {
  it("よく知られた例と一致する", () => {
    expect(honmeiGua(1990, "male")).toBe(1); // 坎
    expect(honmeiGua(1990, "female")).toBe(8); // 艮
    expect(honmeiGua(2000, "male")).toBe(9); // 離
    expect(honmeiGua(2000, "female")).toBe(6); // 乾
  });

  it("5 は本命卦にならない（男は坤、女は艮に振り替える）", () => {
    /*
      1900〜2050 を総当たりして、5 が 1 度も出ないことを見る。
      振り替えを忘れると YOUXING_TABLE に無い鍵を引いて落ちる。
    */
    for (let y = 1900; y <= 2050; y++) {
      for (const sex of ["male", "female"] as Sex[]) {
        const gua = honmeiGua(y, sex);
        expect(gua, `${y} ${sex}`).not.toBe(5);
        expect(ALL_GUA, `${y} ${sex}`).toContain(gua);
      }
    }
  });

  it("世紀をまたいでも連続している（1999 と 2000 で飛ばない）", () => {
    // 男性は 1 ずつ減る並びなので、隣り合う年で 2 つ飛ばない
    const a = honmeiGua(1999, "male");
    const b = honmeiGua(2000, "male");
    const diff = Math.abs(a - b);
    expect(diff === 1 || diff === 8 || diff === 3).toBe(true);
  });
});

describe("八宅の表（写し間違いの検算）", () => {
  it("どの本命卦でも、吉が 4 つ・凶が 4 つ", () => {
    for (const gua of ALL_GUA) {
      const year = findYearForGua(gua);
      const reading = readFengShui(year.year, year.sex);
      const good = reading.directions.filter((d) => d.auspicious);
      expect(good, `卦 ${gua}`).toHaveLength(4);
      expect(reading.directions, `卦 ${gua}`).toHaveLength(8);
    }
  });

  it("8 方位が漏れなく 1 回ずつ出る", () => {
    for (const gua of ALL_GUA) {
      const y = findYearForGua(gua);
      const reading = readFengShui(y.year, y.sex);
      const dirs = reading.directions.map((d) => d.direction).sort();
      expect(dirs, `卦 ${gua}`).toEqual([...COMPASS_DIRECTIONS].sort());
    }
  });

  it("遊星も漏れなく 1 回ずつ（同じ遊星が 2 方位に付かない）", () => {
    for (const gua of ALL_GUA) {
      const y = findYearForGua(gua);
      const reading = readFengShui(y.year, y.sex);
      const set = new Set(reading.directions.map((d) => d.youxing));
      expect(set.size, `卦 ${gua}`).toBe(8);
    }
  });

  it("東四命の吉方位は 東・南東・南・北 の 4 つ", () => {
    for (const gua of EAST_GROUP) {
      const y = findYearForGua(gua);
      const reading = readFengShui(y.year, y.sex);
      const good = reading.directions
        .filter((d) => d.auspicious)
        .map((d) => d.direction)
        .sort();
      expect(good, `卦 ${gua}`).toEqual(["E", "N", "S", "SE"]);
    }
  });

  it("西四命の吉方位は 西・北西・北東・南西 の 4 つ", () => {
    for (const gua of WEST_GROUP) {
      const y = findYearForGua(gua);
      const reading = readFengShui(y.year, y.sex);
      const good = reading.directions
        .filter((d) => d.auspicious)
        .map((d) => d.direction)
        .sort();
      expect(good, `卦 ${gua}`).toEqual(["NE", "NW", "SW", "W"]);
    }
  });

  it("伏位は必ず本命卦そのものの方位", () => {
    const HOME: Record<Gua, string> = {
      1: "N",
      2: "SW",
      3: "E",
      4: "SE",
      6: "NW",
      7: "W",
      8: "NE",
      9: "S",
    };
    for (const gua of ALL_GUA) {
      const y = findYearForGua(gua);
      const reading = readFengShui(y.year, y.sex);
      const fukui = reading.directions.find((d) => d.youxing === "伏位");
      expect(fukui?.direction, `卦 ${gua}`).toBe(HOME[gua]);
    }
  });

  it("吉の遊星はちょうど 4 種類", () => {
    expect(AUSPICIOUS_YOUXING).toHaveLength(4);
  });
});

describe("1 方位だけ引く", () => {
  it("readFengShui と同じ答えになる", () => {
    const one = fengShuiFor(1990, "male", "SE");
    expect(one.youxing).toBe("生気");
    expect(one.auspicious).toBe(true);
    expect(one.meaning).toContain("勢い");
  });

  it("凶方位も理由つきで返る（黙って隠さない）", () => {
    const one = fengShuiFor(1990, "male", "SW");
    expect(one.youxing).toBe("絶命");
    expect(one.auspicious).toBe(false);
    expect(one.meaning.length).toBeGreaterThan(0);
  });
});

/** その本命卦になる年と性別を 1 つ探す。 */
function findYearForGua(gua: Gua): { year: number; sex: Sex } {
  for (let y = 1930; y <= 2030; y++) {
    for (const sex of ["male", "female"] as Sex[]) {
      if (honmeiGua(y, sex) === gua) return { year: y, sex };
    }
  }
  throw new Error(`卦 ${gua} になる年が見つからない`);
}

/**
 * 本命卦に使う年は立春で切る。
 *
 * 1 月 1 日で切ると 2 月上旬生まれの本命卦がひとつずれる。ここは
 * **年盤と同じ太陽黄経 315 度**で切っていて、暦の表を別に持たない。
 * 日付表を持つと年盤とずれた年が出る。
 *
 * 下の期待値は実測（`AstroEngine.getSolarLongitude` の値）で、
 * 2000 年の立春は 2/4 の夜。**同じ 2/4 でも年が変わる**ことを固定する。
 */
describe("本命卦に使う年（立春で切る）", () => {
  /** JST の正午。時刻でずれる境目を踏まないようにする。 */
  const jstNoon = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d, 3, 0, 0));

  it("1 月生まれは前の年になる", () => {
    expect(honmeiYearFor(jstNoon(1990, 1, 1))).toBe(1989);
    expect(honmeiYearFor(jstNoon(2026, 1, 31))).toBe(2025);
  });

  it("立春の前後で切り替わる（1990 年は 2/4）", () => {
    expect(honmeiYearFor(jstNoon(1990, 2, 3))).toBe(1989);
    expect(honmeiYearFor(jstNoon(1990, 2, 4))).toBe(1990);
  });

  it("立春が夜に来る年は、その日の昼はまだ前の年（2000 年）", () => {
    /*
      2000 年の立春は 2/4 の 20 時台。暦の日付だけで「2/4 以降」と
      切ると、この日の昼生まれが 1 年ずれる。
    */
    expect(honmeiYearFor(jstNoon(2000, 2, 4))).toBe(1999);
    expect(honmeiYearFor(jstNoon(2000, 2, 5))).toBe(2000);
  });

  it("3 月以降と 12 月はその年のまま", () => {
    expect(honmeiYearFor(jstNoon(2024, 3, 1))).toBe(2024);
    expect(honmeiYearFor(jstNoon(2024, 12, 31))).toBe(2024);
  });

  it("同じ日でも時刻で変わる（立春は日ではなく瞬間）", () => {
    /*
      1990 年の立春は 2/4 の昼ごろ。日付の表で「2/4 以降」と切る実装だと
      朝生まれも 1990 になってしまう。太陽黄経で切っているので分かれる。

      ここが落ちたら、実装が日付表に戻っている疑いがある。
    */
    const morning = new Date(Date.UTC(1990, 1, 3, 23, 0, 0)); // JST 2/4 08:00
    const evening = new Date(Date.UTC(1990, 1, 4, 11, 0, 0)); // JST 2/4 20:00
    expect(honmeiYearFor(morning)).toBe(1989);
    expect(honmeiYearFor(evening)).toBe(1990);
  });

  it("年をまたいでも本命卦が飛ばない（1〜12 月で最大 1 回だけ変わる）", () => {
    for (let y = 1950; y <= 2040; y++) {
      const changes = [];
      for (let m = 1; m <= 12; m++) {
        changes.push(honmeiYearFor(jstNoon(y, m, 15)));
      }
      const distinct = new Set(changes);
      expect(distinct.size).toBeLessThanOrEqual(2);
      expect(Math.max(...changes) - Math.min(...changes)).toBeLessThanOrEqual(
        1,
      );
    }
  });
});
