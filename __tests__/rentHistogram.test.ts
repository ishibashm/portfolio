import { describe, expect, it } from "vitest";
import {
  BUCKET_COUNT,
  BUCKET_YEN,
  OVERFLOW_FLOOR_YEN,
  shapeRentHistogram,
} from "../src/lib/rentHistogram";

/**
 * 家賃分布の升目の整形。
 *
 * 件数 0 の升が抜けると棒の位置が詰まって横軸が金額として読めなく
 * なる。width_bucket の範囲外の番号（0 と上限超え）の扱いを
 * 取り違えると、あふれ升の数字が消えるか、存在しない升に入る。
 */
describe("shapeRentHistogram", () => {
  it("件数 0 の升も含めて全升を返す", () => {
    const buckets = shapeRentHistogram([]);
    expect(buckets).toHaveLength(BUCKET_COUNT);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("升番号 → 金額の対応が 1 万円刻み", () => {
    const buckets = shapeRentHistogram([{ bucket: 1, n: 3 }]);
    expect(buckets[0]).toEqual({ fromYen: 0, toYen: BUCKET_YEN, count: 3 });
    expect(buckets[7].fromYen).toBe(70_000);
    expect(buckets[7].toYen).toBe(80_000);
  });

  it("最後の升はあふれ（30 万円以上・上端なし）", () => {
    const buckets = shapeRentHistogram([{ bucket: BUCKET_COUNT, n: 5 }]);
    const last = buckets[BUCKET_COUNT - 1];
    expect(last.fromYen).toBe(OVERFLOW_FLOOR_YEN);
    expect(last.toYen).toBeNull();
    expect(last.count).toBe(5);
  });

  it("範囲外の升番号（0・上限超え・非整数）は捨てる", () => {
    const buckets = shapeRentHistogram([
      { bucket: 0, n: 9 },
      { bucket: BUCKET_COUNT + 1, n: 9 },
      { bucket: 1.5, n: 9 },
      { bucket: 2, n: 4 },
    ]);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
    expect(buckets[1].count).toBe(4);
  });

  it("同じ升が複数行来ても合算する", () => {
    const buckets = shapeRentHistogram([
      { bucket: 3, n: 2 },
      { bucket: 3, n: 5 },
    ]);
    expect(buckets[2].count).toBe(7);
  });
});
