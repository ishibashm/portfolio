import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTIONS,
  findAuspiciousDays,
  findAuspiciousDaysAllDirections,
  gradeVerdict,
  judgeDayAllDirections,
  type DayVerdict,
} from "@/utils/auspiciousDays";
import { jstNoonOf } from "@/utils/boardInstant";
import type { StarFrequency } from "@/utils/ephemerisEngine";
import type { TenchusatsuMode } from "@/utils/tenchusatsuPolicy";

/**
 * 日取りの表が拾う日の範囲（scope）。
 *
 * 利用者の指摘（2026-09-29）「三盤吉の方角しか出ないけど、凶がないなら
 * 他の方角も出したらどう？」。/calendar の説明文は「どの盤にも凶が
 * 入らない日を並べる」と書いていたのに、実装は三盤とも吉の日だけだった。
 *
 * CLAUDE.md 3 節の手順で固定する。
 *
 * 1. **既定（scope 省略 = "triple"）は旧実装と完全に同じ。**旧実装を
 *    下に写し、本命星 9 × 経度 2 × 開始日 2 で、方位の並び・日付・件数が
 *    一致することを見る（MCP と従来の呼び出しの答えを変えない）
 * 2. **"noBad" は凶の無い日（S・A・B・C）をすべて、それだけ拾う。**
 *    同じ範囲を 1 日ずつ判定し直して、漏れも混入も無いことを見る
 * 3. "noBad" でも三盤吉の日と、三盤吉の件数（tripleAuspiciousDays・
 *    availableDays・blockedByTenchusatsuDays）は "triple" と同じ
 *
 * 旧挙動に戻すと落ちることを確かめた:
 * - scope の既定を "noBad" にする → 1 が落ちる
 * - 拾う段階に D を足す → 2 が落ちる
 */

/** 旧実装（2026-09-29 以前の findAuspiciousDaysAllDirections）の写し。 */
function legacyAllDirections(
  from: Date,
  to: Date,
  p: Parameters<typeof judgeDayAllDirections>[1],
) {
  const perDirection: Record<string, DayVerdict[]> = {};
  for (const dir of ALL_DIRECTIONS) perDirection[dir] = [];
  let cursor = jstNoonOf(from);
  const end = jstNoonOf(to);
  let scanned = 0;
  while (cursor <= end && scanned < 800) {
    const all = judgeDayAllDirections(new Date(cursor), p);
    scanned++;
    for (const dir of ALL_DIRECTIONS) {
      if (all[dir].isTripleAuspicious) perDirection[dir].push(all[dir]);
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return ALL_DIRECTIONS.map((direction) => {
    const days = perDirection[direction];
    const blocked = days.filter((d) => d.blockedByTenchusatsu).length;
    return {
      direction,
      tripleAuspiciousDays: days.length,
      availableDays: days.length - blocked,
      blockedByTenchusatsuDays: blocked,
      days,
    };
  }).sort((a, b) => b.availableDays - a.availableDays);
}

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as StarFrequency[];
const LONS = [135.7, 141.35];
const STARTS = ["2026-01-20", "2026-09-30"];
const SPAN_DAYS = 30;

function params(star: StarFrequency, lon: number) {
  return {
    honmeiStar: star,
    voidZodiacs: ["辰", "巳"],
    lon,
    tenchusatsuMode: "strict" as TenchusatsuMode,
  };
}
function range(start: string) {
  const from = new Date(`${start}T12:00:00+09:00`);
  const to = new Date(from.getTime() + SPAN_DAYS * 86400000);
  return { from, to };
}
const cases = STARS.flatMap((star) =>
  LONS.flatMap((lon) => STARTS.map((start) => ({ star, lon, start }))),
);

describe("既定（三盤吉だけ）は旧実装と同じ", () => {
  it.each(cases)(
    "本命星 $star・東経 $lon・$start から",
    ({ star, lon, start }) => {
      const { from, to } = range(start);
      const p = params(star, lon);
      const legacy = legacyAllDirections(from, to, p);
      const now = findAuspiciousDaysAllDirections(from, to, p);
      expect(now.map((s) => s.direction)).toEqual(
        legacy.map((s) => s.direction),
      );
      for (const [i, s] of now.entries()) {
        const l = legacy[i];
        expect(s.days).toEqual(l.days);
        expect(s.tripleAuspiciousDays).toBe(l.tripleAuspiciousDays);
        expect(s.availableDays).toBe(l.availableDays);
        expect(s.blockedByTenchusatsuDays).toBe(l.blockedByTenchusatsuDays);
        expect(s.noBadDays).toBeUndefined();
        expect(s.days.every((d) => d.tier === undefined)).toBe(true);
      }
    },
  );
});

describe('"noBad" は凶の無い日をすべて、それだけ拾う', () => {
  it.each(cases)(
    "本命星 $star・東経 $lon・$start から",
    ({ star, lon, start }) => {
      const { from, to } = range(start);
      const p = params(star, lon);
      const triple = findAuspiciousDaysAllDirections(from, to, p);
      const noBad = findAuspiciousDaysAllDirections(from, to, p, "noBad");

      // 1 日ずつ判定し直した「凶の無い日」の正解
      const expected: Record<string, string[]> = {};
      for (const dir of ALL_DIRECTIONS) expected[dir] = [];
      let cursor = jstNoonOf(from);
      while (cursor <= jstNoonOf(to)) {
        const all = judgeDayAllDirections(new Date(cursor), p);
        for (const dir of ALL_DIRECTIONS) {
          if (["S", "A", "B", "C"].includes(gradeVerdict(all[dir])))
            expected[dir].push(all[dir].date);
        }
        cursor = new Date(cursor.getTime() + 86400000);
      }

      for (const s of noBad) {
        expect(s.days.map((d) => d.date)).toEqual(expected[s.direction]);
        for (const d of s.days) {
          expect(d.tier).toBe(gradeVerdict(d));
          expect(["S", "A", "B", "C"]).toContain(d.tier);
        }
        const t = triple.find((x) => x.direction === s.direction)!;
        // 三盤吉の日と件数は変わらない
        expect(
          s.days.filter((d) => d.isTripleAuspicious).map((d) => d.date),
        ).toEqual(t.days.map((d) => d.date));
        expect(s.tripleAuspiciousDays).toBe(t.tripleAuspiciousDays);
        expect(s.availableDays).toBe(t.availableDays);
        expect(s.blockedByTenchusatsuDays).toBe(t.blockedByTenchusatsuDays);
        expect(s.noBadDays).toBe(s.days.length);
        expect(s.availableNoBadDays).toBe(
          s.days.filter((d) => !d.blockedByTenchusatsu).length,
        );
      }
    },
  );

  it("三盤吉の多い順のまま、同数なら凶の無い日の多い順", () => {
    const { from, to } = range("2026-09-30");
    const noBad = findAuspiciousDaysAllDirections(
      from,
      to,
      params(7, 135.7),
      "noBad",
    );
    for (let i = 1; i < noBad.length; i++) {
      const [a, b] = [noBad[i - 1], noBad[i]];
      expect(a.availableDays).toBeGreaterThanOrEqual(b.availableDays);
      if (a.availableDays === b.availableDays)
        expect(a.availableNoBadDays!).toBeGreaterThanOrEqual(
          b.availableNoBadDays!,
        );
    }
  });

  it("1 方位を指定したときも同じ範囲を拾う", () => {
    const { from, to } = range("2026-09-30");
    const p = params(7, 135.7);
    const all = findAuspiciousDaysAllDirections(from, to, p, "noBad");
    const one = findAuspiciousDays(
      from,
      to,
      { ...p, direction: "NW" },
      "noBad",
    );
    const nw = all.find((s) => s.direction === "NW")!;
    expect(one.days.map((d) => [d.date, d.tier])).toEqual(
      nw.days.map((d) => [d.date, d.tier]),
    );
    expect(one.noBadDays).toBe(nw.noBadDays);
  });

  it("空回りしていない: 三盤吉ではない凶なしの日が実際に拾われている", () => {
    const { from, to } = range("2026-09-30");
    const noBad = findAuspiciousDaysAllDirections(
      from,
      to,
      params(7, 135.7),
      "noBad",
    );
    const extra = noBad.flatMap((s) => s.days).filter((d) => d.tier !== "S");
    expect(extra.length).toBeGreaterThan(0);
  });
});
