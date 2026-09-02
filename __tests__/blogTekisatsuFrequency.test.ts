import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { judgeDayAllDirections } from "@/utils/auspiciousDays";
import { generateBoard, getClassicalYearStar } from "@/utils/ephemerisEngine";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

/**
 * 公開記事 what-is-honmei-teki-satsu の「どれくらいの頻度で当たるのか」の
 * 表を、ツールの判定で数え直して照合する。
 *
 * ## なぜ判定で数えるのか（盤の座では合わない）
 *
 * 盤の上で本命星の真向かいを数えると、どの方位も 730 日中 81〜82 日に
 * なる。記事の 60〜81 日と合わない。記事は**画面に「本命的殺」と出る
 * 日**を数えていて、同じ場所に五黄殺・暗剣殺・破が重なる日は、そちらの
 * 名前で表示されるぶん少なくなる。この差は仕様（表示の優先順位）で、
 * 記事もそのとおりに書いてある。だからここも判定（dayLayer /
 * monthLayer）で数える。
 *
 * ## 9 星ぶんにした経緯
 *
 * 以前は本命七赤だけの数字だった。利用者の指摘で、記事が軒並み七赤を
 * 例にしていて他の星の人には自分の行が無いと分かった（#870 と同じ）。
 * 七赤 1 つの表を 9 星の表にし、この検査で 9 行すべてを固定する。
 *
 * 数えてみて分かったこと。**どの星にも、的殺が一度も出ない方位が
 * 1 つある**（その盤では五黄殺が同じ場所に重なる）。本命五黄土星は
 * 本命殺・的殺が常に五黄殺・暗剣殺と重なるので、全部 0 になる。記事は
 * この 2 つを本文で説明しているので、そこも固定する。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/what-is-honmei-teki-satsu.md"),
  "utf-8",
);

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const DAYS = 730;
/* 記事と同じ起点。JST 正午で判定する（既存の照合テストと同じ引き方） */
const DATES = Array.from(
  { length: DAYS },
  (_, i) => new Date(Date.UTC(2026, 0, 1, 3) + i * 86400000),
);

interface Counts {
  day: Record<string, number>;
  month: Record<string, number>;
  anyDay: number;
}

function count(star: number): Counts {
  const day: Record<string, number> = {};
  const month: Record<string, number> = {};
  for (const d of DIRS) {
    day[d] = 0;
    month[d] = 0;
  }
  let anyDay = 0;
  for (const date of DATES) {
    const v = judgeDayAllDirections(date, {
      honmeiStar: star as never,
      voidZodiacs: [],
      lon: 139.6917,
      tenchusatsuMode: "MODERATE" as never,
    });
    let hit = false;
    for (const d of DIRS) {
      if (v[d].dayLayer === "NOISE_TEKI") {
        day[d]++;
        hit = true;
      }
      if (v[d].monthLayer === "NOISE_TEKI") month[d]++;
    }
    if (hit) anyDay++;
  }
  return { day, month, anyDay };
}

/** 0 を除いた「min〜max 日」。全部 0 なら "0 日"。 */
function range(o: Record<string, number>): string {
  const nz = Object.values(o).filter((x) => x > 0);
  if (nz.length === 0) return "0 日";
  return `${Math.min(...nz)}〜${Math.max(...nz)} 日`;
}

function zeroDirections(o: Record<string, number>): string[] {
  return DIRS.filter((d) => o[d] === 0).map((d) => DIRECTION_LABELS[d]);
}

/** 記事の表の行。`| 一白水星 | 61〜81 日 | 507 日 | 31〜91 日 |` */
function rowFor(star: number): string[] {
  const name = STAR_NAMES[star];
  const line = md.split("\n").find((l) => l.startsWith(`| ${name} `));
  expect(line, `${name} の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

describe("記事: 本命的殺の頻度（9 星ぶんの表）", () => {
  it("9 星ぶんの行が揃っている", () => {
    for (let star = 1; star <= 9; star++) {
      expect(rowFor(star).length, STAR_NAMES[star]).toBe(4);
    }
  });

  for (let star = 1; star <= 9; star++) {
    it(`${STAR_NAMES[star]} の行が判定と一致する`, () => {
      const [, dayCell, anyCell, monthCell] = rowFor(star);
      const c = count(star);
      /* 五黄だけは「0 日（下記）」と注記付き。数字の部分だけ比べる */
      expect(dayCell.replace(/（.*）/, "")).toBe(range(c.day));
      expect(anyCell).toBe(`${c.anyDay} 日`);
      expect(monthCell).toBe(range(c.month));

      if (star === 5) {
        /* 本命五黄: 本命殺は五黄殺、的殺は暗剣殺と常に重なり、全部 0 */
        expect(zeroDirections(c.day)).toHaveLength(8);
        expect(zeroDirections(c.month)).toHaveLength(8);
      } else {
        /* それ以外: 的殺が一度も出ない方位がちょうど 1 つ */
        expect(zeroDirections(c.day)).toHaveLength(1);
        expect(zeroDirections(c.month)).toEqual(zeroDirections(c.day));
      }
    }, 30_000);
  }

  it("本文が挙げる「的殺が一度も出ない方位」の例が正しい", () => {
    expect(md).toContain("一白なら西、三碧なら北西、七赤なら南東");
    expect(zeroDirections(count(1).day)).toEqual(["西"]);
    expect(zeroDirections(count(3).day)).toEqual(["北西"]);
    expect(zeroDirections(count(7).day)).toEqual(["南東"]);
  }, 30_000);

  it("「どこかの方位が的殺」の幅（486〜508 日）が表と整合する", () => {
    const values = Array.from({ length: 9 }, (_, i) => i + 1)
      .filter((s) => s !== 5)
      .map((s) => Number(rowFor(s)[2].replace(" 日", "")));
    expect(Math.min(...values)).toBe(486);
    expect(Math.max(...values)).toBe(508);
    expect(md).toContain("730 日のうち **486〜508 日**");
  });

  it("先に結論の「60〜81 日」が、9 星の表の幅（五黄を除く）と一致する", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = 1; s <= 9; s++) {
      if (s === 5) continue;
      const m = rowFor(s)[1].match(/^(\d+)〜(\d+) 日$/);
      expect(m, STAR_NAMES[s]).toBeTruthy();
      lo = Math.min(lo, Number(m![1]));
      hi = Math.max(hi, Number(m![2]));
    }
    expect(md).toContain(`730 日中 ${lo}〜${hi} 日`);
  });

  it("見つけ方の例（四緑木星・2028 年盤）が年盤と一致する", () => {
    const chuguu = getClassicalYearStar(new Date("2028-06-01T03:00:00Z"));
    expect(chuguu).toBe(8);
    const board = generateBoard(chuguu) as unknown as Record<string, number>;
    expect(DIRS.find((d) => board[d] === 4)).toBe("N");
    expect(md).toContain("四緑は北にあります");
  });

  it("空回りしていない（七赤の 730 日で 400 日以上、どこかが的殺）", () => {
    expect(count(7).anyDay).toBeGreaterThan(400);
  }, 30_000);
});
