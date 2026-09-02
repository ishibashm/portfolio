import { describe, it, expect } from "vitest";
import { computeDayKigaku } from "@/lib/dayKigakuClient";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  type DirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { prefectureDirections } from "@/lib/prefectureDirection";

/**
 * 物件検索の「選択日の盤」（dayKigaku）を page.tsx の useMemo から
 * lib/dayKigakuClient に切り出し、import() で遅延して読むようにした。
 *
 * 目的は初回読み込みから暦エンジンを外すことで、**判定の答えは 1 つも
 * 変えない。**それを固定するため、切り出す前の useMemo の本体をここに
 * そのまま写し（reference）、広い入力で computeDayKigaku と突き合わせる
 * （CLAUDE.md 3 節の手順）。
 *
 * 旧実装との違いは「同期の useMemo か、遅延の import() か」だけ。
 * 値は同じでなければならない。
 */

interface Input {
  birthDate: string;
  targetDate: string;
  baseLat: string;
  baseLon: string;
  tenchusatsuMode: string;
  involuntaryMove: boolean;
  directionFilterMode: DirectionFilterMode;
  useClassical: boolean;
}

/** 切り出す前の useMemo の本体（page.tsx 1706〜1764 行）の写し。 */
function reference(p: Input) {
  try {
    const bd = new Date(
      p.birthDate.includes("T") ? p.birthDate : `${p.birthDate}T12:00:00+09:00`,
    );
    if (isNaN(bd.getTime())) return undefined;
    const honmei = getHonmeiStar(bd);
    const all = judgeDayAllDirections(
      new Date(`${p.targetDate}T12:00:00+09:00`),
      {
        honmeiStar: honmei.classical,
        voidZodiacs: getPersonalVoidZodiac(bd),
        lon: Number(p.baseLon),
        tenchusatsuMode: p.tenchusatsuMode as never,
        involuntaryMove: p.involuntaryMove,
        directionFilterMode: p.directionFilterMode,
      },
    );
    type Cell = {
      direction: string;
      directionLabel: string;
      tier: string;
      blocked: boolean;
      doyouSatsu: boolean;
    };
    const byDirection: Record<string, Cell> = {};
    for (const dir of ALL_DIRECTIONS) {
      const v = all[dir];
      if (!v) continue;
      byDirection[dir] = {
        direction: dir,
        directionLabel: DIRECTION_LABELS[dir] ?? dir,
        tier: gradeVerdict(v),
        blocked: v.blockedByTenchusatsu,
        doyouSatsu: v.isDoyouSatsu,
      };
    }
    const prefDirs = prefectureDirections(
      Number(p.baseLat),
      Number(p.baseLon),
      p.useClassical ? "traditional" : "physical",
    );
    const byPrefecture: Record<string, Cell> = {};
    for (const [name, dir] of Object.entries(prefDirs)) {
      const cell = byDirection[dir];
      if (!cell) continue;
      byPrefecture[name] = cell;
    }
    return { byDirection, byPrefecture };
  } catch {
    return undefined;
  }
}

/* 運営者の値は使わない（__tests__/personalDataLeak.test.ts）。 */
const BIRTHS = ["1990-01-19", "1975-06-30", "2001-12-05T09:30:00+09:00"];
const BASES: [string, string][] = [
  ["35.0116", "135.7681"], // 京都
  ["43.0642", "141.3469"], // 札幌
  ["26.2124", "127.6809"], // 那覇
];
const DATES = ["2026-02-03", "2026-02-04", "2026-09-02", "2027-07-15"];
const MODES: DirectionFilterMode[] = [
  "composite",
  "personal_kigaku",
  "personal_bazi",
  "environmental",
];

describe("dayKigakuClient は切り出す前の useMemo と同じ答えを返す", () => {
  it("生年月日 × 出発地 × 日付 × 見方 × 天中殺の扱いで一致する", () => {
    let compared = 0;
    for (const birthDate of BIRTHS)
      for (const [baseLat, baseLon] of BASES)
        for (const targetDate of DATES)
          for (const directionFilterMode of MODES)
            for (const tenchusatsuMode of ["strict", "weaken", "off"])
              for (const useClassical of [true, false]) {
                const input: Input = {
                  birthDate,
                  targetDate,
                  baseLat,
                  baseLon,
                  tenchusatsuMode,
                  involuntaryMove: false,
                  directionFilterMode,
                  useClassical,
                };
                expect(computeDayKigaku(input)).toEqual(reference(input));
                compared++;
              }
    expect(compared).toBe(3 * 3 * 4 * 4 * 3 * 2);
  }, 60_000);

  it("空回りしていない（段階が方位ごとに分かれ、県別も埋まる）", () => {
    const out = computeDayKigaku({
      birthDate: "1990-01-19",
      targetDate: "2026-09-02",
      baseLat: "35.0116",
      baseLon: "135.7681",
      tenchusatsuMode: "strict",
      involuntaryMove: false,
      directionFilterMode: "composite",
      useClassical: true,
    });
    expect(out).toBeDefined();
    expect(Object.keys(out!.byDirection)).toHaveLength(8);
    expect(
      new Set(Object.values(out!.byDirection).map((c) => c.tier)).size,
    ).toBeGreaterThan(1);
    expect(Object.keys(out!.byPrefecture).length).toBeGreaterThan(40);
  });

  it("壊れた生年月日は undefined（旧実装と同じ）", () => {
    const input: Input = {
      birthDate: "not-a-date",
      targetDate: "2026-09-02",
      baseLat: "35.0116",
      baseLon: "135.7681",
      tenchusatsuMode: "strict",
      involuntaryMove: false,
      directionFilterMode: "composite",
      useClassical: true,
    };
    expect(computeDayKigaku(input)).toBeUndefined();
    expect(reference(input)).toBeUndefined();
  });
});
