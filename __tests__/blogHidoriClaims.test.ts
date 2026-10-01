import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";

/**
 * 公開記事 what-is-hidori-for-moving の数字を暦エンジンと照合する。
 *
 * 記事の 2 つの表（仏滅・赤口と土用で外れる日数、引越しに向く日とうち
 * 土日）は、サイトの月ごとの一覧（buildMonthlyCalendar）を回した結果を
 * そのまま書いている。一覧の規則や六曜・土用の計算を直すと記事だけが
 * 古くなるので、ここで突き合わせる（blogTenshaClaims と同じ考え方）。
 */

const SLUG = "what-is-hidori-for-moving";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

const MONTHS: [number, number][] = [
  [2026, 10],
  [2026, 11],
  [2026, 12],
  [2027, 1],
  [2027, 2],
  [2027, 3],
];

function facts(y: number, m: number) {
  const c = buildMonthlyCalendar(y, m);
  return {
    bad: c.days.filter((d) => /^(仏滅|赤口)/.test(String(d.rokuyo))).length,
    doyou: c.days.filter((d) => d.inDoyou && !d.isMabi).length,
    good: c.recommended.length,
    weekend: c.recommended.filter((d) => d.weekday === 0 || d.weekday === 6)
      .length,
  };
}

/** 表の 1 行のセル（「| 2026 年 10 月  | 12 日 | 9 日 |」） */
function cells(table: string, y: number, m: number): string[] {
  const re = new RegExp(`^\\| ${y} 年 ${m} 月\\s*\\|(.+)\\|\\s*$`, "m");
  const row = re.exec(table);
  if (!row) throw new Error(`${y}-${m} の行が無い`);
  return row[1].split("|").map((s) => s.trim());
}

function section(heading: string): string {
  const start = md.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  const end = md.indexOf("\n## ", start + heading.length);
  return md.slice(start, end === -1 ? undefined : end);
}

describe(`記事 ${SLUG} の数字`, () => {
  it.each(MONTHS)("%i 年 %i 月: 外れる日の表", (y, m) => {
    const t = section("## 暦の上で避けられる日は");
    const [bad, doyou] = cells(t, y, m);
    const f = facts(y, m);
    expect(bad).toBe(`${f.bad} 日`);
    expect(doyou).toBe(`${f.doyou} 日`);
  });

  it.each(MONTHS)("%i 年 %i 月: 向く日とうち土日の表", (y, m) => {
    const t = section("## 2026年10月〜2027年3月の「引越しに向く日」");
    const [good, weekend, link] = cells(t, y, m);
    const f = facts(y, m);
    expect(good).toBe(`${f.good} 日`);
    expect(weekend).toBe(`${f.weekend} 日`);
    expect(link).toContain(`(/calendar/${y}-${String(m).padStart(2, "0")})`);
  });

  it("結論の幅（月に 3〜9 日、うち土日は 1〜4 日）が表と合う", () => {
    const all = MONTHS.map(([y, m]) => facts(y, m));
    const g = all.map((f) => f.good);
    const w = all.map((f) => f.weekend);
    expect(md).toContain(`月に ${Math.min(...g)}〜${Math.max(...g)} 日`);
    expect(md).toContain(`土日は月に ${Math.min(...w)}〜${Math.max(...w)} 日`);
  });

  it("2027 年 1 月は土用が 1 月 17 日から", () => {
    const c = buildMonthlyCalendar(2027, 1);
    expect(c.doyou?.start).toBe("2027-01-17");
    expect(md).toContain("土用（1 月 17 日から）");
  });
});
