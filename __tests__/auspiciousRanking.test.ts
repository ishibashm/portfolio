import { describe, expect, it } from "vitest";

import {
  DayTier,
  DayVerdict,
  TIER_LABELS,
  TIER_ORDER,
  gradeVerdict,
  rankRelocationDays,
  summarizeWindows,
} from "@/utils/auspiciousDays";

/** gradeVerdict は盤の状態しか見ないので、それ以外は埋め草でよい */
function verdict(
  yearLayer: string,
  monthLayer: string,
  dayLayer: string,
  finalStatus: string,
  isTripleAuspicious = false,
): DayVerdict {
  return {
    date: "2026-08-10",
    weekday: 1,
    yearLayer,
    monthLayer,
    dayLayer,
    finalStatus,
    isTripleAuspicious,
    voidScopes: { year: false, month: false, day: false },
    blockedByTenchusatsu: false,
    hasTendo: false,
    isDoyouSatsu: false,
    rokuyo: "大安",
    isTensho: false,
    isIchiryumanbai: false,
    tags: [],
  };
}

describe("gradeVerdict の段階", () => {
  it("三盤吉は S", () => {
    expect(
      gradeVerdict(verdict("OPTIMAL", "OPTIMAL", "OPTIMAL", "OPTIMAL", true)),
    ).toBe("S");
  });

  it("吉2盤・凶なしは A、吉1盤は B、すべて平は C", () => {
    expect(gradeVerdict(verdict("OPTIMAL", "OPTIMAL", "SAFE", "SAFE"))).toBe(
      "A",
    );
    expect(gradeVerdict(verdict("OPTIMAL", "SAFE", "SAFE", "SAFE"))).toBe("B");
    expect(gradeVerdict(verdict("SAFE", "SAFE", "SAFE", "SAFE"))).toBe("C");
  });

  it("軽い凶（天中殺方位・月命殺・ノードなど）は D。吉が混ざっても D のまま", () => {
    expect(gradeVerdict(verdict("NOISE_VOID", "SAFE", "SAFE", "SAFE"))).toBe(
      "D",
    );
    expect(
      gradeVerdict(verdict("SAFE", "NOISE_GETSUMEI", "SAFE", "SAFE")),
    ).toBe("D");
    expect(
      gradeVerdict(verdict("OPTIMAL", "NOISE_NODE", "OPTIMAL", "SAFE")),
    ).toBe("D");
  });

  it("五大凶殺（五黄殺・暗剣殺・破・本命殺・的殺）はどこにあっても X", () => {
    expect(gradeVerdict(verdict("NOISE_GOU", "SAFE", "SAFE", "SAFE"))).toBe(
      "X",
    );
    expect(gradeVerdict(verdict("SAFE", "NOISE_ANKEN", "SAFE", "SAFE"))).toBe(
      "X",
    );
    // 破も五大凶殺。エンジンは五黄殺と同格の絶対格として扱っており、
    // 以前ここを D（次善候補）に落としていたのは食い違いだった。
    expect(gradeVerdict(verdict("NOISE_HA", "SAFE", "SAFE", "SAFE"))).toBe("X");
    expect(gradeVerdict(verdict("SAFE", "SAFE", "NOISE_HONMEI", "SAFE"))).toBe(
      "X",
    );
    // 天道の補正などで最終だけに凶が残るケースも拾う
    expect(gradeVerdict(verdict("SAFE", "SAFE", "SAFE", "NOISE_TEKI"))).toBe(
      "X",
    );
  });

  it("五大凶殺と軽い凶が同居したら X を採る", () => {
    expect(
      gradeVerdict(verdict("NOISE_GOU", "NOISE_VOID", "SAFE", "SAFE")),
    ).toBe("X");
  });

  it("全段階にラベルがある", () => {
    for (const t of TIER_ORDER) {
      expect(TIER_LABELS[t]).toBeTruthy();
    }
  });
});

describe("rankRelocationDays（実エンジンでの走査）", () => {
  const base = {
    honmeiStar: 5 as const,
    voidZodiacs: [] as string[],
    lon: 135.5,
    tenchusatsuMode: "strict" as const,
    involuntaryMove: false,
  };
  const from = new Date("2026-08-10T12:00:00+09:00");
  const to = new Date("2026-09-08T12:00:00+09:00");

  it("8方位すべてが返り、全日がどこかの段階に入る", () => {
    const ranked = rankRelocationDays(from, to, base);
    expect(ranked).toHaveLength(8);
    for (const s of ranked) {
      const total = TIER_ORDER.reduce((a, t) => a + s.tierCounts[t], 0);
      expect(total).toBe(s.scannedDays);
    }
  });

  it("X は決して候補（bestAvailableTier / topDays / 月の見取り図）に出ない", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      expect(s.bestAvailableTier).not.toBe("X");
      for (const d of s.topDays) expect(d.tier).not.toBe("X");
      for (const m of s.months) expect(m.bestTier).not.toBe("X");
    }
  });

  it("topDays は bestAvailableTier の日だけで、天中殺で塞がれた日を含まない", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      for (const d of s.topDays) {
        expect(d.tier).toBe(s.bestAvailableTier);
        expect(d.blockedByTenchusatsu).toBe(false);
      }
    }
  });

  it("方位は段階の良い順に並ぶ", () => {
    const ranked = rankRelocationDays(from, to, base);
    const ranks = ranked.map((s) =>
      s.bestAvailableTier
        ? TIER_ORDER.indexOf(s.bestAvailableTier as DayTier)
        : 99,
    );
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("月の見取り図は走査した月をすべて含み、firstDate はその月の日付", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      expect(s.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
      for (const m of s.months) {
        if (m.firstDate) expect(m.firstDate.startsWith(m.month)).toBe(true);
      }
    }
  });
});

describe("summarizeWindows（窓の統計）", () => {
  it("連続日を窓としてまとめ、間隔を数える", () => {
    const w = summarizeWindows([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03", // 3日の窓
      "2026-08-10", // 1日の窓（間隔6日）
      "2026-08-11", // →2日の窓
    ])!;
    expect(w.count).toBe(2);
    expect(w.maxLen).toBe(3);
    expect(w.avgLen).toBeCloseTo(2.5);
    expect(w.avgGapDays).toBe(6);
  });

  it("窓が1つなら間隔は null", () => {
    const w = summarizeWindows(["2026-08-01", "2026-08-02"])!;
    expect(w.count).toBe(1);
    expect(w.avgGapDays).toBeNull();
  });

  it("月またぎの連続も1つの窓", () => {
    const w = summarizeWindows(["2026-08-31", "2026-09-01"])!;
    expect(w.count).toBe(1);
    expect(w.maxLen).toBe(2);
  });

  it("空なら null", () => {
    expect(summarizeWindows([])).toBeNull();
  });
});

describe("rankRelocationDays の firstDate / windows", () => {
  const base = {
    honmeiStar: 5 as const,
    voidZodiacs: [] as string[],
    lon: 135.5,
    tenchusatsuMode: "strict" as const,
    involuntaryMove: false,
  };
  const from = new Date("2026-08-10T12:00:00+09:00");
  const to = new Date("2026-09-08T12:00:00+09:00");

  it("firstDate は bestAvailableTier の最初の候補日と一致する", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      if (s.bestAvailableTier === null) {
        expect(s.firstDate).toBeNull();
        expect(s.windows).toBeNull();
      } else {
        expect(s.firstDate).toBeTruthy();
        // topDays は天赦日優先の並びだが、firstDate は純粋に日付順の先頭
        const dates = s.topDays.map((d) => d.date).sort();
        expect(s.firstDate! <= dates[0]).toBe(true);
        expect(s.windows).not.toBeNull();
        expect(s.windows!.count).toBeGreaterThan(0);
      }
    }
  });
});

describe("topDays と firstDate の整合（8/10 が消えた不具合の回帰テスト）", () => {
  const base = {
    honmeiStar: 5 as const,
    voidZodiacs: [] as string[],
    lon: 135.5,
    tenchusatsuMode: "off" as const,
    involuntaryMove: false,
  };
  // 2年走査。縁起日が遠い将来に散らばる状況を作る
  const from = new Date("2026-08-10T12:00:00+09:00");
  const to = new Date("2028-08-08T12:00:00+09:00");

  it("topDays の先頭は必ず firstDate と一致する", () => {
    // 意思決定サマリーは firstDate を出す。チップ（topDays）に
    // その日が無いと「最速は8/10」と言いながら8/10が選べない。
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      if (!s.firstDate) continue;
      expect(s.topDays[0]?.date).toBe(s.firstDate);
    }
  });

  it("topDays は日付の昇順で、縁起優先の並べ替えをしない", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      const dates = s.topDays.map((d) => d.date);
      expect([...dates].sort()).toEqual(dates);
    }
  });

  it("luckyDays は天赦日か一粒万倍日だけを含む", () => {
    const ranked = rankRelocationDays(from, to, base);
    for (const s of ranked) {
      for (const d of s.luckyDays) {
        expect(d.tags.includes("天赦日") || d.tags.includes("一粒万倍日")).toBe(
          true,
        );
        expect(d.tier).toBe(s.bestAvailableTier);
      }
    }
  });
});
