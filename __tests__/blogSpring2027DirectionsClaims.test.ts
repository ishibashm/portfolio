import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";
import {
  STAR_NAMES,
  STARS,
  getMonthDirections,
  getYearDirections,
  kigakuMonthRange,
} from "@/lib/kigakuContent";
import { toJapanDateString } from "@/utils/japanDate";

/**
 * 公開記事 spring-2027-moving-directions-by-star の数字を判定と照合する。
 *
 * 記事の表（本命星ごとの両方吉、節月の期間、立春をまたぐ年盤の吉、
 * 節月ごとの向く日）は、方位の頁（getYearDirections / getMonthDirections）
 * と月ごとの一覧（buildMonthlyCalendar）を回した結果をそのまま書いている。
 * 判定や暦の計算を直すと記事だけが古くなるので、ここで突き合わせる
 * （blogHidoriClaims と同じ考え方）。
 */

const SLUG = "spring-2027-moving-directions-by-star";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** [暦の年, 暦の月, 使う年盤の年] */
const TERMS: [number, number, number][] = [
  [2026, 12, 2026],
  [2027, 1, 2026],
  [2027, 2, 2027],
  [2027, 3, 2027],
  [2027, 4, 2027],
  [2027, 5, 2027],
];

const good = (vs: { kind: string; jp: string }[]) =>
  vs.filter((v) => v.kind === "good").map((v) => v.jp);

function bothGood(y: number, m: number, yb: number, star: number): string {
  const year = good(getYearDirections(yb, star).verdicts);
  const month = good(getMonthDirections(y, m, star).verdicts);
  const both = month.filter((d) => year.includes(d));
  return both.length ? both.join("・") : "なし";
}

function section(heading: string): string {
  const start = md.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  const end = md.indexOf("\n## ", start + heading.length);
  return md.slice(start, end === -1 ? undefined : end);
}

function row(table: string, head: string): string[] {
  const re = new RegExp(`^\\| ${head}\\s*\\|(.+)\\|\\s*$`, "m");
  const r = re.exec(table);
  if (!r) throw new Error(`${head} の行が無い`);
  return r[1].split("|").map((s) => s.trim());
}

const ymd = (d: Date) => toJapanDateString(d);

describe(`記事 ${SLUG} の数字`, () => {
  it.each(STARS)("本命星 %i: 両方吉の表", (star) => {
    const t = section("## 本命星ごとの、両方吉の方位");
    const cells = row(t, STAR_NAMES[star]);
    const yearGood = good(getYearDirections(2027, star).verdicts).join("・");
    expect(cells[0]).toBe(yearGood);
    TERMS.forEach(([y, m, yb], i) => {
      expect(cells[i + 1], `${y}-${m}`).toBe(bothGood(y, m, yb, star));
    });
  });

  it.each(TERMS)("%i 年 %i 月: 節月の期間と中宮", (y, m, yb) => {
    const t = section("## 本命星ごとの、両方吉の方位");
    const r = kigakuMonthRange(y, m);
    const cells = row(t, `${y} 年 ${m} 月`);
    expect(cells[0]).toBe(`${ymd(r.start)} 〜 ${ymd(r.end)}`);
    expect(cells[1]).toBe(STAR_NAMES[r.centerStar]);
    expect(cells[2]).toBe(`${yb} 年`);
  });

  it("3 月はどの星にも両方吉が無く、4 月は 6 つの星に開く", () => {
    const march = STARS.filter((s) => bothGood(2027, 3, 2027, s) !== "なし");
    const april = STARS.filter((s) => bothGood(2027, 4, 2027, s) !== "なし");
    expect(march).toEqual([]);
    expect(april.length).toBe(6);
    expect(april).not.toContain(1);
    expect(april).not.toContain(3);
    expect(april).not.toContain(4);
  });

  it.each(STARS)("本命星 %i: 立春をまたぐ年盤の吉", (star) => {
    const t = section("## 立春をまたぐと");
    const [y2026, y2027] = row(t, STAR_NAMES[star]);
    expect(y2026).toBe(good(getYearDirections(2026, star).verdicts).join("・"));
    expect(y2027).toBe(good(getYearDirections(2027, star).verdicts).join("・"));
  });

  it.each([
    [2027, 2],
    [2027, 3],
    [2027, 4],
  ])("%i 年 %i 月: 節月の向く日とうち土日", (y, m) => {
    const t = section("## その月に「引越しに向く日」は何日あるか");
    const r = kigakuMonthRange(y, m);
    const s = ymd(r.start);
    const e = ymd(r.end);
    const rec = [m, m + 1]
      .flatMap((mm) => buildMonthlyCalendar(y, mm).recommended)
      .filter((d) => d.date >= s && d.date <= e);
    const weekend = rec.filter((d) => d.weekday === 0 || d.weekday === 6);
    const [count, wk, dates] = row(t, `${y} 年 ${m} 月`);
    expect(count).toBe(`${rec.length} 日`);
    expect(wk).toBe(`${weekend.length} 日`);
    const listed = dates.split("・").map((x) => x.replace(/（.）/, ""));
    expect(listed).toEqual(
      rec.map(
        (d) => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`,
      ),
    );
  });

  it("2027 年 4 月の土用は 4 月 17 日から 5 月 5 日まで", () => {
    const c = buildMonthlyCalendar(2027, 4);
    expect(c.doyou).toEqual({ start: "2027-04-17", end: "2027-05-05" });
    expect(md).toContain("4 月 17 日から 5 月 5 日まで土用");
  });
});
