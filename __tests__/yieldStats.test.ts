import { describe, expect, it } from "vitest";

import {
  CELL_DEGREES,
  MIN_SAMPLES_PER_SIDE,
  cellCenter,
  cellIdFor,
  grossYield,
} from "@/utils/yieldStats";

/**
 * 表面利回りの集計。
 *
 * ここで守りたいのは 2 つ。
 *
 *   1. 賃貸と購入で**同じ丸め方**をすること。別々に丸めると、境目の
 *      物件がずれた区画に入り、片側だけ件数が増える
 *   2. 出せないときに **null を返すこと**。0 を返すと「賃料が 0」の意味に
 *      なり、「出せない」と区別がつかなくなる
 */

describe("区画への丸め", () => {
  it("同じ区画に入る座標は同じ識別子になる", () => {
    // 0.05 度の格子。35.00〜35.05 は同じ区画。
    expect(cellIdFor(35.001, 135.001)).toBe(cellIdFor(35.049, 135.049));
  });

  it("区画をまたぐと識別子が変わる", () => {
    expect(cellIdFor(35.049, 135.0)).not.toBe(cellIdFor(35.051, 135.0));
    expect(cellIdFor(35.0, 135.049)).not.toBe(cellIdFor(35.0, 135.051));
  });

  it("南半球・西経でも破綻しない", () => {
    // floor を使っているので負でも連続する。round だと 0 の周りで
    // 区画の幅が倍になる。
    expect(cellIdFor(-0.01, -0.01)).not.toBe(cellIdFor(0.01, 0.01));
    expect(cellIdFor(-0.06, 0)).not.toBe(cellIdFor(-0.01, 0));
  });

  it("中心は区画の真ん中に来る", () => {
    const id = cellIdFor(35.02, 135.02);
    const c = cellCenter(id);
    expect(c.lat).toBeGreaterThan(35.0);
    expect(c.lat).toBeLessThan(35.05);
    expect(c.lon).toBeGreaterThan(135.0);
    expect(c.lon).toBeLessThan(135.05);
    // 中心なので、そこを丸め直すと同じ区画に戻る。
    expect(cellIdFor(c.lat, c.lon)).toBe(id);
  });

  it("座標が数値でなければ投げる", () => {
    // 黙って 0:0 の区画（アフリカ沖）に落とすと、そこだけ件数が
    // 積み上がって地図に嘘の濃い点が出る。
    expect(() => cellIdFor(NaN, 135)).toThrow();
    expect(() => cellIdFor(35, NaN)).toThrow();
  });

  it("読めない識別子は投げる", () => {
    expect(() => cellCenter("abc")).toThrow();
    expect(() => cellCenter("")).toThrow();
  });

  it("刻みは 0.05 度", () => {
    // 変えるときは「片側の件数が足りない区画が増えないか」を確かめる。
    expect(CELL_DEGREES).toBe(0.05);
  });
});

describe("表面利回り", () => {
  const side = (n: number, v: number) => ({ n, medianPerSqm: v });

  it("年利回りを返す（月額を 12 倍して割る）", () => {
    // 月 3,000 円/㎡、購入 60 万円/㎡ → 年 36,000 / 600,000 = 6%
    expect(grossYield(side(10, 3000), side(10, 600000))).toBeCloseTo(0.06, 10);
  });

  it("片側が無ければ null", () => {
    expect(grossYield(null, side(10, 600000))).toBeNull();
    expect(grossYield(side(10, 3000), null)).toBeNull();
    expect(grossYield(null, null)).toBeNull();
  });

  it("件数が足りなければ null", () => {
    // 1 件の外れ値で区画の色が変わるのを防ぐ。中央値でも n=1 なら
    // その 1 件そのもの。
    const few = MIN_SAMPLES_PER_SIDE - 1;
    expect(grossYield(side(few, 3000), side(10, 600000))).toBeNull();
    expect(grossYield(side(10, 3000), side(few, 600000))).toBeNull();
    expect(
      grossYield(
        side(MIN_SAMPLES_PER_SIDE, 3000),
        side(MIN_SAMPLES_PER_SIDE, 600000),
      ),
    ).not.toBeNull();
  });

  it("0 や負の単価では null（0 を返さない）", () => {
    // 0 を返すと「賃料が 0」の意味になり、「出せない」と区別がつかない。
    expect(grossYield(side(10, 3000), side(10, 0))).toBeNull();
    expect(grossYield(side(10, 3000), side(10, -1))).toBeNull();
    expect(grossYield(side(10, 0), side(10, 600000))).toBeNull();
  });

  it("NaN では null", () => {
    expect(grossYield(side(10, NaN), side(10, 600000))).toBeNull();
    expect(grossYield(side(10, 3000), side(10, NaN))).toBeNull();
  });
});
