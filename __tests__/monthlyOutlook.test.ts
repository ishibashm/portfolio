import { describe, expect, it } from "vitest";
import {
  bestOutlookMonth,
  monthlyOutlook,
  OPEN_TIERS,
} from "@/utils/monthlyOutlook";
import {
  dayCategory,
  type DayCategory,
  type FilterableDay,
} from "@/lib/timingFilter";
import type { DayTier } from "@/utils/auspiciousDays";

/**
 * 月ごとの見通しを、Q 値から段階評価に置き換えた件の検証。
 *
 * いちばん大事なのは**下のカレンダーと数字が一致すること**。
 * 利用者の指摘が「サイトでの一貫性のある評価基準がなくどれを信じて
 * いいのか分からない」だったので、「この月は動ける日が n 日」と
 * 「カレンダーで動ける色のマスが n 個」がずれないことを固定する。
 */

type Day = FilterableDay & { date: string };

const DIR = "NW";

function day(date: string, tier: string, opts?: { blocked?: boolean }): Day {
  return {
    date,
    blocked: opts?.blocked ?? false,
    tiers: { [DIR]: tier },
    tags: [],
  };
}

describe("monthlyOutlook", () => {
  it("月ごとに分けて、日付の昇順で返す", () => {
    const got = monthlyOutlook(
      [day("2026-12-01", "S"), day("2026-11-30", "X"), day("2027-01-02", "B")],
      DIR,
    );
    expect(got.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(got[0]).toMatchObject({ year: 2026, monthOfYear: 11 });
    expect(got[2]).toMatchObject({ year: 2027, monthOfYear: 1 });
  });

  it("動ける日は三盤吉・吉2盤・吉1盤の合計", () => {
    const [m] = monthlyOutlook(
      [
        day("2026-11-01", "S"),
        day("2026-11-02", "A"),
        day("2026-11-03", "B"),
        day("2026-11-04", "C"),
        day("2026-11-05", "D"),
        day("2026-11-06", "X"),
      ],
      DIR,
    );
    expect(m.total).toBe(6);
    expect(m.open).toBe(3);
    expect(m.bestTier).toBe("S");
  });

  it("天中殺の日は段階が良くても動ける日に入らない", () => {
    const [m] = monthlyOutlook(
      [
        day("2026-11-01", "S", { blocked: true }),
        day("2026-11-02", "S", { blocked: true }),
        day("2026-11-03", "B"),
      ],
      DIR,
    );
    expect(m.counts.BLOCKED).toBe(2);
    expect(m.counts.S).toBe(0);
    expect(m.open).toBe(1);
    expect(m.bestTier).toBe("B");
  });

  it("fromIso より前は数えない", () => {
    const got = monthlyOutlook(
      [day("2026-10-31", "S"), day("2026-11-01", "S")],
      DIR,
      "2026-11-01",
    );
    expect(got).toHaveLength(1);
    expect(got[0].month).toBe("2026-11");
  });

  it("方位が未選択なら平として数える（カレンダーの既定と同じ）", () => {
    const [m] = monthlyOutlook([day("2026-11-01", "S")], null);
    expect(m.counts.C).toBe(1);
    expect(m.open).toBe(0);
  });
});

describe("カレンダーと一致する（乱数で総当たり）", () => {
  const TIERS: DayTier[] = ["S", "A", "B", "C", "D", "X"];
  const ALL: DayCategory[] = [...TIERS, "BLOCKED"];

  it("どのカテゴリの数も、dayCategory で数え直したものと一致する", () => {
    let seed = 20260830;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let round = 0; round < 200; round++) {
      const days: Day[] = [];
      for (let i = 0; i < 90; i++) {
        const d = new Date(Date.UTC(2026, 9, 1 + i));
        days.push(
          day(d.toISOString().slice(0, 10), TIERS[Math.floor(next() * 6)], {
            blocked: next() < 0.15,
          }),
        );
      }

      const months = monthlyOutlook(days, DIR);
      // カレンダーの塗りをそのまま数え直す
      for (const m of months) {
        const same = days.filter((d) => d.date.startsWith(m.month));
        expect(m.total).toBe(same.length);
        for (const key of ALL) {
          const painted = same.filter(
            (d) => dayCategory(d, DIR) === key,
          ).length;
          expect(m.counts[key]).toBe(painted);
        }
        // 内訳の合計は必ずその月の日数
        const sum = ALL.reduce((a, k) => a + m.counts[k], 0);
        expect(sum).toBe(m.total);
        // 動ける日は S/A/B のぶんだけ
        expect(m.open).toBe(OPEN_TIERS.reduce((a, t) => a + m.counts[t], 0));
      }
    }
  });
});

describe("bestOutlookMonth", () => {
  const month = (m: string, counts: Partial<Record<string, number>>) =>
    monthlyOutlook(
      Object.entries(counts).flatMap(([tier, n]) =>
        Array.from({ length: n as number }, (_, i) =>
          day(`${m}-${String(i + 1).padStart(2, "0")}`, tier, {
            blocked: tier === "BLOCKED",
          }),
        ),
      ),
      DIR,
    )[0];

  it("動ける日が多い月を選ぶ", () => {
    const got = bestOutlookMonth([
      month("2026-11", { B: 3 }),
      month("2026-12", { B: 7 }),
      month("2027-01", { B: 5 }),
    ]);
    expect(got?.month).toBe("2026-12");
  });

  it("同数なら段階の良いほうを選ぶ", () => {
    const got = bestOutlookMonth([
      month("2026-11", { B: 4 }),
      month("2026-12", { S: 1, B: 3 }),
    ]);
    expect(got?.month).toBe("2026-12");
    expect(got?.bestTier).toBe("S");
  });

  it("同数・同段階なら早い月", () => {
    const got = bestOutlookMonth([
      month("2026-11", { S: 2, B: 2 }),
      month("2026-12", { S: 2, B: 2 }),
    ]);
    expect(got?.month).toBe("2026-11");
  });

  it("天中殺だらけの月は選ばれない", () => {
    const got = bestOutlookMonth([
      month("2026-11", { BLOCKED: 30 }),
      month("2026-12", { B: 1 }),
    ]);
    expect(got?.month).toBe("2026-12");
  });

  it("どこにも動ける日が無ければ null（いちばんマシな月を作らない）", () => {
    expect(
      bestOutlookMonth([
        month("2026-11", { X: 30 }),
        month("2026-12", { D: 31 }),
      ]),
    ).toBeNull();
  });
});
