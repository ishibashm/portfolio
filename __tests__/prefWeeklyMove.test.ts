import { describe, expect, it } from "vitest";
import {
  weeklyBaseRow,
  weeklyMoveFromRows,
  type DailySummaryRow,
} from "@/utils/marketStats";

/**
 * 県ページの「この 1 週間の動き」の計算。
 *
 * 集計は毎晩必ず成功するとは限らない（落ちる夜がある）ので、比較の
 * 基準は「ちょうど 7 日前」ではなく「7 日以上前でいちばん近い日」。
 * 7 日未満しか無いときは何も出さない（「今週の動き」と言えない）。
 */

const row = (date: string, n: number, mr: number, msr: number) =>
  ({ date, n, medianRent: mr, medianSqmRent: msr }) satisfies DailySummaryRow;

describe("weeklyBaseRow — 比較の基準日", () => {
  it("7 日以上前でいちばん近い日を選ぶ（欠けた夜を飛ばす）", () => {
    const rows = [
      row("2026-09-01", 100, 60000, 1800),
      row("2026-09-02", 101, 60100, 1801),
      // 9/3〜9/6 は集計が落ちて無い
      row("2026-09-07", 105, 60500, 1810),
      row("2026-09-08", 106, 60600, 1812),
      row("2026-09-09", 107, 60700, 1815),
    ];
    const pair = weeklyBaseRow(rows);
    expect(pair?.latest.date).toBe("2026-09-09");
    /* 9/9 の 7 日前は 9/2。ちょうどあるのでそれ */
    expect(pair?.base.date).toBe("2026-09-02");
  });

  it("ちょうど 7 日前が無ければ、それより前でいちばん近い日", () => {
    const rows = [
      row("2026-09-01", 100, 60000, 1800),
      row("2026-09-04", 102, 60200, 1803),
      row("2026-09-09", 107, 60700, 1815),
    ];
    const pair = weeklyBaseRow(rows);
    /* 9/2 は無い。9/4 は 5 日前で近すぎる。9/1（8 日前）を使う */
    expect(pair?.base.date).toBe("2026-09-01");
  });

  it("7 日ぶん貯まっていなければ出さない", () => {
    const rows = [
      row("2026-09-05", 100, 60000, 1800),
      row("2026-09-09", 107, 60700, 1815),
    ];
    expect(weeklyBaseRow(rows)).toBeUndefined();
    expect(weeklyBaseRow([])).toBeUndefined();
  });

  it("並びが日付順でなくても最新を選ぶ", () => {
    const rows = [
      row("2026-09-09", 107, 60700, 1815),
      row("2026-09-01", 100, 60000, 1800),
    ];
    expect(weeklyBaseRow(rows)?.latest.date).toBe("2026-09-09");
  });
});

describe("weeklyMoveFromRows — 差の計算", () => {
  it("件数の差と中央値の %差を出す", () => {
    const m = weeklyMoveFromRows(
      "東京都",
      row("2026-09-09", 1070, 127000, 3050),
      row("2026-09-02", 1000, 125000, 3000),
      { newListings7d: 210, priceCuts7d: 47, priceRises7d: 3 },
    );
    expect(m.prefecture).toBe("東京都");
    expect(m.latestDate).toBe("2026-09-09");
    expect(m.baseDate).toBe("2026-09-02");
    expect(m.n).toBe(1070);
    expect(m.nDelta).toBe(70);
    expect(m.medianRentDeltaPct).toBe(1.6);
    expect(m.medianSqmRentDeltaPct).toBeCloseTo(1.67, 2);
    expect(m.newListings7d).toBe(210);
    expect(m.priceCuts7d).toBe(47);
  });

  it("値下げ件数は null（数えられない）と 0（無かった）を区別して持つ", () => {
    const base = row("2026-09-02", 1000, 125000, 3000);
    const latest = row("2026-09-09", 1000, 125000, 3000);
    const unknown = weeklyMoveFromRows("a", latest, base, {
      newListings7d: 0,
      priceCuts7d: null,
      priceRises7d: null,
    });
    const zero = weeklyMoveFromRows("a", latest, base, {
      newListings7d: 0,
      priceCuts7d: 0,
      priceRises7d: 0,
    });
    expect(unknown.priceCuts7d).toBeNull();
    expect(zero.priceCuts7d).toBe(0);
  });

  it("基準の値が 0 なら %差は 0 にする（割らない）", () => {
    const m = weeklyMoveFromRows(
      "a",
      row("2026-09-09", 10, 50000, 1000),
      row("2026-09-02", 0, 0, 0),
      { newListings7d: 0, priceCuts7d: null, priceRises7d: null },
    );
    expect(m.medianRentDeltaPct).toBe(0);
    expect(Number.isFinite(m.medianSqmRentDeltaPct)).toBe(true);
  });
});
