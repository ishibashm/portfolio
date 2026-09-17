import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getYearDirections, STAR_NAMES } from "@/lib/kigakuContent";
import { AstroEngine } from "@/utils/ephemerisEngine";
import { NOISE_PRIORITY } from "@/utils/noiseSeverity";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 公開記事 five-yellow-and-anken-satsu の数字を盤エンジンと照合する。
 *
 * 記事の表（2026〜2031 年の中宮・五黄殺・暗剣殺・立春）と、本文の
 * 「2026 年の北は暗剣殺と歳破の重なりで表示は暗剣殺」「2027 年は
 * 歳破が北東へ」「五黄中宮の年は五黄殺も暗剣殺も無い」「重なりの順は
 * 五黄殺・暗剣殺・破・本命殺・本命的殺」は、どれもサイトの盤と規則から
 * 出した値。盤の切り替え（立春の瞬間）や NOISE_PRIORITY を直すと記事
 * だけが古くなる。散文は tsc も lint も守ってくれないので、ここで
 * 突き合わせる（blogTenshaClaims と同じ考え方）。
 *
 * 2026-09-17 の週替わりのスポットチェック（c）で書いた。記事を出した
 * とき（#1333）は照合テストが無かった。
 */

const SLUG = "five-yellow-and-anken-satsu";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** 立春（黄経 315 度）の瞬間。solarTermTimezone と同じ二分探索。 */
function risshun(year: number): Date {
  let lo = Date.UTC(year, 0, 20);
  let hi = Date.UTC(year, 1, 20);
  const ahead = (t: number) =>
    (AstroEngine.getSolarLongitude(new Date(t)) - 315 + 360) % 360 < 180;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

const ALL_STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** 年盤の五黄殺・暗剣殺の方位（日本語）。無ければ「なし」。本命星に依らない。 */
function boardFacts(year: number) {
  const { centerStar, verdicts } = getYearDirections(year, 1);
  const gou = verdicts.find((v) => v.status === "NOISE_GOU");
  const anken = verdicts.find((v) => v.status === "NOISE_ANKEN");
  return {
    center: STAR_NAMES[centerStar],
    gou: gou?.jp ?? "なし",
    anken: anken?.jp ?? "なし",
  };
}

/** 記事の表の行。「| 2026 | 一白水星   | 南     | 北     | 2月4日 05:01     |」 */
const rows = [
  ...md.matchAll(
    /^\| (\d{4}) \| (\S+)\s*\| (\S+)\s*\| (\S+)\s*\| (\d+)月(\d+)日 (\d{2}):(\d{2})\s*\|$/gm,
  ),
].map((m) => ({
  year: Number(m[1]),
  center: m[2],
  gou: m[3],
  anken: m[4],
  risshun: `${m[5]}月${m[6]}日 ${m[7]}:${m[8]}`,
}));

describe("記事: 五黄殺と暗剣殺（年盤の表）", () => {
  it("表は 2026〜2031 年の 6 行", () => {
    expect(rows.map((r) => r.year)).toEqual([
      2026, 2027, 2028, 2029, 2030, 2031,
    ]);
  });

  it.each(rows)("$year 年: 中宮 $center・五黄殺 $gou・暗剣殺 $anken", (row) => {
    const facts = boardFacts(row.year);
    expect(facts.center).toBe(row.center);
    expect(facts.gou).toBe(row.gou);
    expect(facts.anken).toBe(row.anken);
  });

  it.each(rows)("$year 年の立春は $risshun（日本時間、分まで）", (row) => {
    const f = getZonedDateTimeFields(risshun(row.year), 9);
    const text = `${f.month}月${f.day}日 ${String(f.hours).padStart(2, "0")}:${String(f.minutes).padStart(2, "0")}`;
    expect(text).toBe(row.risshun);
  });

  it("五黄殺・暗剣殺は本命星に依らない（9 星で同じ）", () => {
    for (const year of [2026, 2027, 2031]) {
      const seen = new Set(
        ALL_STARS.map((s) => {
          const { verdicts } = getYearDirections(year, s);
          const gou =
            verdicts.find((v) => v.status === "NOISE_GOU")?.jp ?? "なし";
          const anken =
            verdicts.find((v) => v.status === "NOISE_ANKEN")?.jp ?? "なし";
          return `${gou}/${anken}`;
        }),
      );
      expect(seen.size, `${year}`).toBe(1);
    }
  });

  it("五黄中宮の年（2031）は年盤に五黄殺も暗剣殺も無い", () => {
    for (const s of ALL_STARS) {
      const { centerStar, verdicts } = getYearDirections(2031, s);
      expect(centerStar).toBe(5);
      expect(verdicts.some((v) => v.status === "NOISE_GOU")).toBe(false);
      expect(verdicts.some((v) => v.status === "NOISE_ANKEN")).toBe(false);
    }
  });
});

describe("記事: 五黄殺と暗剣殺（重なりの順と歳破）", () => {
  it("重なりの順は五黄殺・暗剣殺・破・本命殺・本命的殺", () => {
    expect(NOISE_PRIORITY.slice(0, 5)).toEqual([
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_HONMEI",
      "NOISE_TEKI",
    ]);
    expect(md).toContain("順は五黄殺・暗剣殺・破・本命殺・本命的殺の順");
  });

  it("2026 年の北は暗剣殺と歳破の重なりで、どの本命星でも「暗剣殺」と出る", () => {
    for (const s of ALL_STARS) {
      const north = getYearDirections(2026, s).verdicts.find(
        (v) => v.direction === "N",
      );
      expect(north?.status, `本命星 ${s}`).toBe("NOISE_ANKEN");
    }
    expect(md).toContain("2026年の北がその例");
  });

  it("2027 年は歳破が北東へ移り、どの本命星でも北東は「破」として出る", () => {
    for (const s of ALL_STARS) {
      const ne = getYearDirections(2027, s).verdicts.find(
        (v) => v.direction === "NE",
      );
      expect(ne?.status, `本命星 ${s}`).toBe("NOISE_HA");
    }
    expect(md).toContain("翌2027年は未年で歳破が北東へ移る");
  });
});
