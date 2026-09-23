import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCurrentZodiac } from "@/utils/ephemerisEngine";
import { directionBoardInstant } from "@/utils/boardInstant";
import {
  evaluateTenchusatsu,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";

/**
 * 公開記事 moving-during-tenchusatsu の数字を、サイトの判定で数え直して
 * 照合する。
 *
 * 記事は Search Console の検索語「天中殺 引越し 影響」（2026-09-24 の
 * 書き出しで表示が最多の検索語、掲載 45 位）に答えるために書いた。
 * 答えの中心は「影響」ではなく**何日動けなくなるか**で、その数は
 * 判定の仕様（正午基準・立春区切り・3 つの設定）でそのまま決まる。
 * 手で書いた表が判定と食い違ったら、ここで落ちる。
 *
 * 数え方は画面と同じ。日本時間の正午を東京の経度で太陽時に直した
 * 時刻の干支を引き（`auspiciousDays` の `computeDayLayers` と同じ）、
 * `evaluateTenchusatsu` に通す。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/moving-during-tenchusatsu.md"),
  "utf-8",
);

const LON = 139.6917;
const PAIRS = ["子丑", "寅卯", "辰巳", "午未", "申酉", "戌亥"] as const;
const MODES: TenchusatsuMode[] = ["strict", "month_day", "day_only"];

const zodiacCache = new Map<string, ReturnType<typeof getCurrentZodiac>>();
function zodiacOf(date: string) {
  let z = zodiacCache.get(date);
  if (!z) {
    z = getCurrentZodiac(
      directionBoardInstant(new Date(`${date}T12:00:00+09:00`), 0, LON),
      LON,
    );
    zodiacCache.set(date, z);
  }
  return z;
}

function daysOf(year: number): string[] {
  const out: string[] = [];
  for (
    let t = Date.UTC(year, 0, 1);
    new Date(t).getUTCFullYear() === year;
    t += 86400000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** 空亡ごとに、設定ごとの「移転不可」の日数。 */
function blockedDays(year: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const pair of PAIRS) {
    const branches = [...pair];
    const counts = MODES.map(() => 0);
    for (const date of daysOf(year)) {
      const z = zodiacOf(date);
      const scopes = {
        year: branches.includes(z.yearZodiac),
        month: branches.includes(z.monthZodiac),
        day: branches.includes(z.dayZodiac),
      };
      MODES.forEach((m, i) => {
        if (evaluateTenchusatsu(scopes, m, false).blocks) counts[i]++;
      });
    }
    out[pair] = counts;
  }
  return out;
}

const y2026 = blockedDays(2026);
const y2027 = blockedDays(2027);

describe("記事の表（空亡ごとに動けない日数）", () => {
  it.each(PAIRS)("%s の行が判定と一致する", (pair) => {
    const cells = [...y2026[pair], ...y2027[pair]].map((n) => `${n}日`);
    const row = new RegExp(`^\\| ${pair} \\|(.+)\\|$`, "m").exec(md);
    expect(row, pair).not.toBeNull();
    const written = row![1].split("|").map((s) => s.trim());
    expect(written).toEqual(cells);
  });
});

describe("本文の数字", () => {
  it("年天中殺に当たらない人は、厳格で 108〜114 日", () => {
    const outside = [
      ...PAIRS.filter((p) => p !== "午未" && p !== "辰巳").map(
        (p) => y2026[p][0],
      ),
      ...PAIRS.filter((p) => p !== "午未").map((p) => y2027[p][0]),
    ];
    expect(Math.min(...outside)).toBe(108);
    expect(Math.max(...outside)).toBe(114);
    expect(md.match(/108〜114日/g)?.length).toBe(2);
  });

  it("午未は 2027 年の 365 日すべてが厳格で不可、年を除くと 251 日戻る", () => {
    expect(y2027["午未"][0]).toBe(365);
    expect(365 - y2027["午未"][1]).toBe(251);
    expect(md).toContain("2027年に251日の動ける日が戻ります");
  });

  it("辰巳は 2026 年の最初の 34 日が年天中殺の残り", () => {
    const first = daysOf(2026).filter((d) =>
      ["辰", "巳"].includes(zodiacOf(d).yearZodiac),
    );
    expect(first.length).toBe(34);
    expect(first[first.length - 1]).toBe("2026-02-03");
    expect(md).toContain("2026年の最初の34日");
  });
});

describe("年天中殺の期間（正午基準・立春区切り）", () => {
  /** その年の 2 月で、正午の年支が変わる最初の日。 */
  function switchDay(year: number): string {
    let prev = zodiacOf(`${year}-01-31`).yearZodiac;
    for (let d = 1; d <= 10; d++) {
      const date = `${year}-02-${String(d).padStart(2, "0")}`;
      const y = zodiacOf(date).yearZodiac;
      if (y !== prev) return date;
      prev = y;
    }
    throw new Error(`${year} 年の 2 月に年支が変わらない`);
  }
  const jp = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  };
  const prevDay = (iso: string) =>
    new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10);

  it.each([
    ["辰巳", 2024],
    ["午未", 2026],
    ["申酉", 2028],
    ["戌亥", 2030],
    ["子丑", 2032],
    ["寅卯", 2034],
  ] as const)("%s（%i 年の立春から）", (pair, start) => {
    const from = switchDay(start);
    const to = prevDay(switchDay(start + 2));
    // 期間の初日は、その空亡の 1 つ目の支の年
    expect(zodiacOf(from).yearZodiac).toBe(pair[0]);
    expect(zodiacOf(to).yearZodiac).toBe(pair[1]);
    // 表は prettier が桁をそろえるので、区切りの前後の空白は問わない
    const row = new RegExp(
      `^\\| ${pair} \\|\\s*${jp(from)}〜${jp(to)}\\s*\\|$`,
      "m",
    );
    expect(md).toMatch(row);
  });

  it("立春が午後の年は、2 月 4 日がまだ前の年（本文の説明どおり）", () => {
    for (const y of [2028, 2032, 2036]) {
      expect(switchDay(y)).toBe(`${y}-02-05`);
    }
    expect(md).toContain("2028年・2032年・2036年");
    expect(md).toContain("2026年2月4日から2028年2月4日まで");
  });
});

describe("転勤など（やむを得ない移動）", () => {
  it("移転不可にせず、弱めて扱う（本文の説明どおり）", () => {
    const v = evaluateTenchusatsu(
      { year: true, month: true, day: true },
      "strict",
      true,
    );
    expect(v.blocks).toBe(false);
    expect(v.attenuation).toBeLessThan(1);
    expect(md).toContain("**移転不可にしません**");
  });
});
