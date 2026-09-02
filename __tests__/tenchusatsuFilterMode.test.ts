// @vitest-environment node
/**
 * 絞り込みモードが天中殺を含まないとき、**期間の禁忌も効かない**こと。
 *
 * ## 何が起きていたか
 *
 * 天中殺には 2 つの効き方がある。
 *
 *   方位 … 空亡の支に当たる方位を凶とする（NOISE_VOID）
 *   期間 … 空亡の年・月・日は動かない（blockedByTenchusatsu）
 *
 * 方位のほうは `filterCollisionByMode` がモードごとに組み直していて、
 * 「本命星のみ」「環境要因のみ」では最初から出ない。**ところが期間の
 * ほうは `tenchusatsuMode` だけを見ていて、絞り込みモードを見て
 * いなかった。**その結果「本命星のみ」を選んでも、/relocation/timing の
 * 月ごとの見通しとカレンダーヒートマップでは天中殺の日が除外され続けて
 * いた（利用者からの報告）。
 *
 * ## このテストの作り
 *
 * CLAUDE.md 3 節の手順に沿う。
 *
 * 1. **旧挙動を写す。**期間の禁忌は `evaluateTenchusatsu` が唯一の
 *    定義元なので、その素の答え（＝絞り込みモードを見ない旧実装と
 *    同じ値）を参照実装として持ち、composite と personal_bazi では
 *    それと一致することを固定する
 * 2. 新挙動（personal_kigaku / environmental では常に false）を、
 *    400 日の広い範囲で固定する
 * 3. **空回りしないことを確かめる。**参照実装が true を返す日が
 *    実際に存在することを assert する。存在しなければ「常に false」は
 *    何も言っていないので、旧実装に戻してもこのテストは通ってしまう
 */
import { describe, it, expect } from "vitest";
import { judgeDayAllDirections, gradeVerdict } from "@/utils/auspiciousDays";
import {
  evaluateTenchusatsu,
  filterModeUsesTenchusatsu,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";

/* 実在の設定に近い値で回す。京都（東経 135.77）・1988-11-25 生まれ。 */
const BIRTH = new Date("1988-11-25T12:00:00+09:00");
const LON = 135.768;
const DAYS = 400;
const START = new Date(Date.UTC(2026, 0, 1));

const honmeiStar = getHonmeiStar(BIRTH).classical;
const voidZodiacs = getPersonalVoidZodiac(BIRTH);

type Mode = "composite" | "personal_kigaku" | "personal_bazi" | "environmental";

interface Row {
  date: string;
  blocked: boolean;
  /** 旧実装（絞り込みモードを見ない）の期間判定。 */
  reference: boolean;
  tiers: string[];
}

function scan(mode: Mode, tenchusatsuMode: TenchusatsuMode): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(START.getTime() + i * 86400000);
    const anchored = new Date(forecastAnchorMs(day));
    const all = judgeDayAllDirections(anchored, {
      honmeiStar,
      voidZodiacs,
      lon: LON,
      tenchusatsuMode,
      directionFilterMode: mode,
    });
    const any = all["N"];
    rows.push({
      date: any.date,
      blocked: any.blockedByTenchusatsu,
      // 旧実装の写し。絞り込みモードを一切見ずに期間を判定していた。
      reference: evaluateTenchusatsu(any.voidScopes, tenchusatsuMode, false)
        .blocks,
      tiers: Object.values(all).map((v) => gradeVerdict(v)),
    });
  }
  return rows;
}

describe("絞り込みモードと天中殺（期間）の対応", () => {
  it("規則そのもの — 含むのは composite と 天中殺のみ の 2 つ", () => {
    expect(filterModeUsesTenchusatsu("composite")).toBe(true);
    expect(filterModeUsesTenchusatsu("personal_bazi")).toBe(true);
    expect(filterModeUsesTenchusatsu("personal_kigaku")).toBe(false);
    expect(filterModeUsesTenchusatsu("environmental")).toBe(false);
  });

  it("空回りしていない（旧実装が禁止していた日が実際にある）", () => {
    const rows = scan("personal_kigaku", "strict");
    const blockedByOld = rows.filter((r) => r.reference).length;
    /* ここが 0 なら、下の「常に false」は何も検証していない。
       1988-11-25 生まれは午未空亡で、2026（丙午）・2027（丁未）が
       年天中殺に当たる。strict では 400 日のうち大半が禁止側になる。 */
    expect(blockedByOld).toBeGreaterThan(100);
  });

  it("composite は旧実装と同じ（挙動を変えていない）", () => {
    for (const mode of ["strict", "month_day", "day_only"] as const) {
      const rows = scan("composite", mode);
      expect(rows.map((r) => r.blocked)).toEqual(rows.map((r) => r.reference));
    }
  });

  it("天中殺のみ も旧実装と同じ（このモードの主役なので残す）", () => {
    const rows = scan("personal_bazi", "strict");
    expect(rows.map((r) => r.blocked)).toEqual(rows.map((r) => r.reference));
  });

  it("本命星のみ では期間の禁忌が効かない", () => {
    for (const mode of ["strict", "month_day", "day_only"] as const) {
      const rows = scan("personal_kigaku", mode);
      expect(rows.every((r) => r.blocked === false)).toBe(true);
    }
  });

  it("環境要因のみ でも期間の禁忌が効かない", () => {
    const rows = scan("environmental", "strict");
    expect(rows.every((r) => r.blocked === false)).toBe(true);
  });

  it("段階（S〜X）は変えていない — 変わるのは天中殺の欄だけ", () => {
    /* 天中殺は方位ではなく期間の禁忌で、段階とは独立に判定している
       （/relocation/timing の註）。この変更でそこが崩れていないこと。 */
    const strict = scan("personal_kigaku", "strict");
    const off = scan("personal_kigaku", "off");
    expect(strict.map((r) => r.tiers)).toEqual(off.map((r) => r.tiers));
  });

  it("使わない（off）は絞り込みモードに関係なく禁止しない", () => {
    for (const mode of [
      "composite",
      "personal_kigaku",
      "personal_bazi",
      "environmental",
    ] as const) {
      const rows = scan(mode, "off");
      expect(rows.every((r) => r.blocked === false)).toBe(true);
    }
  });
});
