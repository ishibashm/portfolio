import { describe, it, expect } from "vitest";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  findAuspiciousDays,
  findAuspiciousDaysAllDirections,
  findYearBoardWindow,
  isAuspicious,
  isInauspicious,
  judgeDay,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

// 三碧木星・午未天中殺の人を基準にする。
//
// 以前は運営者の生年月日を使っていた。公開リポジトリなので、同じ
// 組み合わせ（本命星 3・午未天中殺）になる別の日付に置き換えた。
// 判定は本命星と空亡だけで決まるので、結果は変わらない。
const BIRTH = new Date("1997-06-15T04:26:00+09:00");
const NAGOYA_LON = 136.9008;

const baseParams = {
  honmeiStar: getHonmeiStar(BIRTH).classical,
  voidZodiacs: getPersonalVoidZodiac(BIRTH),
  lon: NAGOYA_LON,
  tenchusatsuMode: "off" as const,
};

describe("isAuspicious / isInauspicious", () => {
  it("平（SAFE）は吉に数えない", () => {
    // 「吉方位を取る」目的では、平凡な方位に動いても意味がない。
    expect(isAuspicious("SAFE")).toBe(false);
    expect(isAuspicious("OPTIMAL")).toBe(true);
    expect(isAuspicious("OPTIMAL_REGULAR")).toBe(true);
  });

  it("NOISE 系はすべて凶", () => {
    expect(isInauspicious("NOISE_GOU")).toBe(true);
    expect(isInauspicious("NOISE_TEKI")).toBe(true);
    expect(isInauspicious("SAFE")).toBe(false);
    expect(isInauspicious(undefined)).toBe(false);
  });
});

describe("judgeDay", () => {
  it("年・月・日それぞれの盤を別々に返す", () => {
    const v = judgeDay(new Date(2026, 8, 7, 12), {
      ...baseParams,
      direction: "SE",
    });
    expect(v.date).toBe("2026-09-07");
    expect(typeof v.yearLayer).toBe("string");
    expect(typeof v.monthLayer).toBe("string");
    expect(typeof v.dayLayer).toBe("string");
  });

  it("どれか一つの盤でも凶なら三盤吉にしない", () => {
    // 最終判定は天道などの補正で吉に持ち上がることがある。
    // それを「三盤とも吉」と数えると、日盤が的殺の日まで混ざる。
    const days: ReturnType<typeof judgeDay>[] = [];
    for (let d = 1; d <= 31; d++) {
      days.push(
        judgeDay(new Date(2026, 11, d, 12), { ...baseParams, direction: "SE" }),
      );
    }
    for (const v of days) {
      if (!v.isTripleAuspicious) continue;
      expect(isInauspicious(v.yearLayer)).toBe(false);
      expect(isInauspicious(v.monthLayer)).toBe(false);
      expect(isInauspicious(v.dayLayer)).toBe(false);
    }
    // 補正で最終が吉でも日盤が凶、という日が実在することを確認する
    const masked = days.filter(
      (v) => isAuspicious(v.finalStatus) && isInauspicious(v.dayLayer),
    );
    expect(masked.length).toBeGreaterThan(0);
    for (const v of masked) expect(v.isTripleAuspicious).toBe(false);
  });

  it("暦注の札が付く", () => {
    const v = judgeDay(new Date(2026, 8, 7, 12), {
      ...baseParams,
      direction: "SE",
    });
    expect(v.tags).toContain("一粒万倍日");
  });

  it("天中殺の当たり具合を年・月・日で返す", () => {
    // 2026 年は午未天中殺の人にとって年天中殺（年支＝未）。
    const v = judgeDay(new Date(2026, 8, 15, 12), {
      ...baseParams,
      direction: "SE",
    });
    expect(v.voidScopes.year).toBe(true);
  });

  it("扱いを strict にすると同じ日が移転不可になる", () => {
    const off = judgeDay(new Date(2026, 8, 15, 12), {
      ...baseParams,
      direction: "SE",
    });
    const strict = judgeDay(new Date(2026, 8, 15, 12), {
      ...baseParams,
      tenchusatsuMode: "strict",
      direction: "SE",
    });
    expect(off.blockedByTenchusatsu).toBe(false);
    expect(strict.blockedByTenchusatsu).toBe(true);
    // 盤の判定そのものは扱いを変えても動かない
    expect(strict.yearLayer).toBe(off.yearLayer);
  });
});

describe("findYearBoardWindow", () => {
  it("年盤が切り替わる日（立春の前日）を返す", () => {
    const w = findYearBoardWindow(new Date(2026, 7, 4, 12), {
      ...baseParams,
      direction: "SE",
    });
    expect(w.yearBoardValidUntil).toBe("2027-02-03");
    expect(w.afterYearBoardStatus).toBeTruthy();
  });

  it("窓の翌日は別の年盤判定になる（期限の意味がある）", () => {
    const w = findYearBoardWindow(new Date(2026, 7, 4, 12), {
      ...baseParams,
      direction: "SE",
    });
    const before = judgeDay(new Date(2027, 1, 3, 12), {
      ...baseParams,
      direction: "SE",
    });
    expect(before.yearLayer).not.toBe(w.afterYearBoardStatus);
  });
});

describe("findAuspiciousDays", () => {
  it("南東の三盤吉日を列挙し、年盤の期限を添える", () => {
    const s = findAuspiciousDays(new Date(2026, 7, 4), new Date(2027, 1, 3), {
      ...baseParams,
      direction: "SE",
    });
    expect(s.directionLabel).toBe("南東");
    expect(s.tripleAuspiciousDays).toBeGreaterThan(0);
    expect(s.days).toHaveLength(s.tripleAuspiciousDays);
    expect(s.window.yearBoardValidUntil).toBe("2027-02-03");
    // 返す日はすべて三盤吉
    for (const d of s.days) expect(d.isTripleAuspicious).toBe(true);
  });

  it("天中殺で落ちる日も残し、印だけ付ける", () => {
    // 落とした結果だけ見せると、扱いを変えると何日変わるのかが分からず
    // 判断そのものができなくなる。
    const strict = findAuspiciousDays(
      new Date(2026, 7, 4),
      new Date(2027, 1, 3),
      { ...baseParams, tenchusatsuMode: "strict", direction: "SE" },
    );
    const off = findAuspiciousDays(new Date(2026, 7, 4), new Date(2027, 1, 3), {
      ...baseParams,
      direction: "SE",
    });
    // 盤の判定は同じなので、列挙される日数は変わらない
    expect(strict.tripleAuspiciousDays).toBe(off.tripleAuspiciousDays);
    // 変わるのは「実質使える日数」のほう
    expect(strict.availableDays).toBe(0);
    expect(strict.blockedByTenchusatsuDays).toBe(strict.tripleAuspiciousDays);
    expect(off.availableDays).toBe(off.tripleAuspiciousDays);
  });

  it("availableDays は 三盤吉 − 天中殺で不可 になる", () => {
    const s = findAuspiciousDays(new Date(2026, 7, 4), new Date(2027, 1, 3), {
      ...baseParams,
      tenchusatsuMode: "strict",
      direction: "SE",
    });
    expect(s.availableDays).toBe(
      s.tripleAuspiciousDays - s.blockedByTenchusatsuDays,
    );
  });

  it("開始日と終了日が同じでも壊れない", () => {
    const s = findAuspiciousDays(new Date(2026, 8, 7), new Date(2026, 8, 7), {
      ...baseParams,
      direction: "SE",
    });
    expect(s.scannedDays).toBe(1);
  });

  it("終了日が開始日より前なら 0 日", () => {
    const s = findAuspiciousDays(new Date(2026, 8, 7), new Date(2026, 8, 1), {
      ...baseParams,
      direction: "SE",
    });
    expect(s.scannedDays).toBe(0);
    expect(s.days).toEqual([]);
  });
});

describe("findAuspiciousDaysAllDirections", () => {
  it("8 方位すべてを返し、使える日数の多い順に並べる", () => {
    const all = findAuspiciousDaysAllDirections(
      new Date(2026, 7, 4),
      new Date(2027, 1, 3),
      baseParams,
    );
    expect(all).toHaveLength(ALL_DIRECTIONS.length);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].availableDays).toBeGreaterThanOrEqual(
        all[i].availableDays,
      );
    }
  });

  it("方位名が日本語で付く", () => {
    const all = findAuspiciousDaysAllDirections(
      new Date(2026, 7, 4),
      new Date(2026, 8, 4),
      baseParams,
    );
    for (const s of all) {
      expect(s.directionLabel).toBe(DIRECTION_LABELS[s.direction]);
    }
  });
});
