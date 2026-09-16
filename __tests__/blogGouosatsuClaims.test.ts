import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMonthDirections,
  getYearDirections,
  STAR_NAMES,
} from "@/lib/kigakuContent";
import { getClassicalDayStar } from "@/utils/ephemerisEngine";
import { gradeVerdict } from "@/utils/auspiciousDays";

/**
 * 公開記事 gouosatsu-and-ankensatsu の表を盤の計算と照合する。
 *
 * 記事は**年盤・月盤の判定（getYearDirections / getMonthDirections）を
 * 回した結果をそのまま表に書いている**。星の巡り方や節入りの切り方を
 * 直すと、記事だけが古くなる。散文は tsc も lint も守ってくれないので、
 * ここで突き合わせる（blogTenshaClaims・blogToolLimitsClaims と同じ）。
 *
 * 五黄殺・暗剣殺は本命星に依らない、というのも記事の主張なので、
 * 2 つの星で同じ答えになることも見る。
 */

const SLUG = "gouosatsu-and-ankensatsu";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];

function yearFacts(year: number, star: number) {
  const { centerStar, verdicts } = getYearDirections(year, star);
  const gou = verdicts.find((v) => v.status === "NOISE_GOU")?.jp ?? "なし";
  const anken = verdicts.find((v) => v.status === "NOISE_ANKEN")?.jp ?? "なし";
  return { center: STAR_NAMES[centerStar], gou, anken };
}

function monthGou(year: number, month: number, star: number) {
  const { verdicts } = getMonthDirections(year, month, star);
  return verdicts.find((v) => v.status === "NOISE_GOU")?.jp ?? "なし";
}

/** 「| 2026 年 | 一白水星 | 南 | 北 |」の行 */
function yearRow(year: number) {
  const hit = md.match(
    new RegExp(
      `^\\| ${year} 年\\s*\\| (\\S+)\\s*\\| (\\S+)\\s*\\| (\\S+)\\s*\\|$`,
      "m",
    ),
  );
  expect(hit, `${year} 年の行が記事に無い`).not.toBeNull();
  return { center: hit![1], gou: hit![2], anken: hit![3] };
}

/** 「| 1 月 | 北 | 南東 |」の行 */
function monthRow(month: number) {
  const hit = md.match(
    new RegExp(`^\\| ${month} 月\\s*\\| (\\S+)\\s*\\| (\\S+)\\s*\\|$`, "m"),
  );
  expect(hit, `${month} 月の行が記事に無い`).not.toBeNull();
  return { y2026: hit![1], y2027: hit![2] };
}

describe("年盤の表（2026〜2032 年）", () => {
  it.each(YEARS)("%d 年の中宮・五黄殺・暗剣殺", (year) => {
    const f = yearFacts(year, 1);
    expect(yearRow(year)).toEqual(f);
  });

  it("五黄殺・暗剣殺は本命星に依らない（一白と九紫で同じ）", () => {
    for (const year of YEARS) {
      const a = yearFacts(year, 1);
      const b = yearFacts(year, 9);
      expect(a.gou).toBe(b.gou);
      expect(a.anken).toBe(b.anken);
    }
  });

  it("五黄が中宮の年（2031 年）だけ五黄殺が無い", () => {
    const none = YEARS.filter((y) => yearFacts(y, 1).gou === "なし");
    expect(none).toEqual([2031]);
    expect(md).toContain("次は 2031 年");
  });
});

describe("月盤の表（2026 年・2027 年）", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("%d 月", (month) => {
    expect(monthRow(month)).toEqual({
      y2026: monthGou(2026, month, 1),
      y2027: monthGou(2027, month, 1),
    });
  });

  it("記事が例に挙げた 2026 年の東西の月", () => {
    // 「東は 3 月と 12 月、西は 7 月に月盤の五黄殺が来ます」
    const east = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (m) => monthGou(2026, m, 1) === "東",
    );
    const west = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
      (m) => monthGou(2026, m, 1) === "西",
    );
    expect(east).toEqual([3, 12]);
    expect(west).toEqual([7]);
    expect(md).toContain("東は 3 月と 12 月、西は 7 月");
  });
});

describe("日盤", () => {
  function centerFiveDays(year: number) {
    let n = 0;
    let total = 0;
    for (
      let d = new Date(Date.UTC(year, 0, 1, 3));
      d.getUTCFullYear() === year;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      total++;
      if (getClassicalDayStar(d) === 5) n++;
    }
    return { n, total };
  }

  it("五黄中宮の日数", () => {
    const a = centerFiveDays(2026);
    const b = centerFiveDays(2027);
    expect(md).toContain(
      `2026 年は ${a.total} 日のうち ${a.n} 日、2027 年は ${b.n} 日`,
    );
  });
});

describe("段階評価での扱い", () => {
  it("日盤だけの五黄殺・暗剣殺でも X（記事の「例外にしない」）", () => {
    for (const status of ["NOISE_GOU", "NOISE_ANKEN"] as const) {
      expect(
        gradeVerdict({
          yearLayer: "SAFE",
          monthLayer: "SAFE",
          dayLayer: status,
          finalStatus: "WARNING",
          isTripleAuspicious: false,
        }),
      ).toBe("X");
    }
  });
});

describe("記事の実体と導線", () => {
  it("下書きではなく、説明がある", () => {
    expect(md).toContain("draft: false");
    expect(md).toMatch(/^description: .{40,}$/m);
  });

  it("年別の早見表（方位ごとの判定を出している頁）から記事へ繋がっている", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "app", "houi", "[year]", "[star]", "page.tsx"),
      "utf8",
    );
    expect(src).toContain(`/blog/${SLUG}`);
  });
});
