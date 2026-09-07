import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * 県ページの「この 1 週間の動き」の見せ方。
 *
 * - 7 日ぶん貯まった県だけ出す。無い県・掲載の少ない県は**何も出さない**
 *   （「準備中」の札を置いて空欄を雛形で埋めない）
 * - 値下げ件数は数えられる環境でだけ出す（null は 0 ではない）
 * - 符号を必ず付ける
 */

vi.mock("@/data/marketStats.json", () => ({
  default: {
    generatedAt: "2026-09-09T07:00:00.000Z",
    totalListings: 0,
    rentIndexSeries: [],
    national: {},
    dailyNewListings: [],
    survival: { curve: [], medianDays: null, n: 0 },
    prefectures: [],
    volatilityRanking: [],
    weeklyMoves: [
      {
        prefecture: "東京都",
        latestDate: "2026-09-09",
        baseDate: "2026-09-02",
        n: 229969,
        nDelta: 1520,
        medianRent: 127000,
        medianRentDeltaPct: 1.6,
        medianSqmRent: 3050,
        medianSqmRentDeltaPct: -0.4,
        newListings7d: 8120,
        priceCuts7d: 47,
        priceRises7d: 3,
      },
      {
        prefecture: "高知県",
        latestDate: "2026-09-09",
        baseDate: "2026-09-02",
        n: 120,
        nDelta: 0,
        medianRent: 45000,
        medianRentDeltaPct: 0,
        medianSqmRent: 1200,
        medianSqmRentDeltaPct: 0,
        newListings7d: 3,
        priceCuts7d: null,
        priceRises7d: null,
      },
    ],
  },
}));

import {
  MIN_N,
  PrefWeeklyMove,
  weeklyMoveFor,
} from "@/components/houi/PrefWeeklyMove";

describe("県ページの「この 1 週間の動き」", () => {
  it("7 日ぶん貯まった県は数字を出す", () => {
    render(<PrefWeeklyMove pref="東京都" />);
    expect(screen.getByText("この 1 週間の動き")).toBeInTheDocument();
    expect(screen.getByText(/9\/2 → 9\/9/)).toBeInTheDocument();
    expect(screen.getByText("229,969件")).toBeInTheDocument();
    expect(screen.getByText("+1,520")).toBeInTheDocument();
    expect(screen.getByText("+1.6%")).toBeInTheDocument();
    /* マイナスは全角のマイナス記号で出す（ハイフンと読み違えない） */
    expect(screen.getByText("−0.4%")).toBeInTheDocument();
    expect(screen.getByText("47 / 3件")).toBeInTheDocument();
  });

  it("貯まっていない県は何も出さない", () => {
    const { container } = render(<PrefWeeklyMove pref="沖縄県" />);
    expect(container).toBeEmptyDOMElement();
    expect(weeklyMoveFor("沖縄県")).toBeUndefined();
  });

  it("掲載の少ない県は数字が振れるので出さない", () => {
    expect(weeklyMoveFor("高知県")?.n).toBeLessThan(MIN_N);
    const { container } = render(<PrefWeeklyMove pref="高知県" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("値下げ件数が数えられない（null）ときはその札を出さない", () => {
    /* 高知県は n が小さいので、東京都の値を null に差し替えて見る */
    const m = weeklyMoveFor("東京都")!;
    m.priceCuts7d = null;
    m.priceRises7d = null;
    render(<PrefWeeklyMove pref="東京都" />);
    expect(screen.queryByText(/値下げ/)).toBeNull();
    /* 他の札は出ている */
    expect(screen.getByText("8,120件")).toBeInTheDocument();
  });
});
