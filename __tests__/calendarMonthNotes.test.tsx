import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarMonthPage from "@/app/calendar/[month]/page";
import {
  CALENDAR_MONTH_NOTES,
  calendarMonthNote,
} from "@/lib/calendarMonthNotes";
import { calendarMonthSlug, calendarMonths } from "@/lib/calendarMonths";
import { STAR_MEANINGS } from "@/lib/kigakuMeanings";
import { STAR_NAMES } from "@/lib/kigakuContent";
import {
  buildMonthlyCalendar,
  type MonthlyCalendar,
} from "@/lib/monthlyCalendar";

vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));

afterEach(() => {
  vi.useRealTimers();
});

/**
 * 計画書と同じ可算文字。英数字・平仮名・片仮名（中黒・と長音ーを含む）・
 * 漢字・々。句読点と括弧は数えない。
 */
const COUNTABLE = /[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3005]/g;

function countChars(text: string): number {
  return text.match(COUNTABLE)?.length ?? 0;
}

/** 説明を足す前に、同じ分け方で測った月固有文字数。 */
const SPECIFIC_BEFORE: Record<string, number> = {
  "2026-11": 943,
  "2026-12": 818,
  "2027-01": 876,
  "2027-02": 788,
  "2027-03": 823,
  "2027-04": 920,
  "2027-05": 927,
  "2027-06": 817,
  "2027-07": 891,
  "2027-08": 876,
  "2027-09": 812,
  "2027-10": 874,
  "2027-11": 902,
  "2027-12": 786,
  "2028-01": 940,
  "2028-02": 842,
  "2028-03": 827,
  "2028-04": 905,
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const SLUGS = Object.keys(CALENDAR_MONTH_NOTES);

function md(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${month}月${day}日`;
}

function hourOf(atJst: string): number {
  return Number(atJst.slice(11, 13));
}

function solar(cal: MonthlyCalendar, name: string) {
  const term = cal.solarTerms.find((item) => item.name === name);
  if (!term) throw new Error(`${name} が ${cal.year}-${cal.month} に無い`);
  return term;
}

function goods(cal: MonthlyCalendar, star: number): string[] {
  const row = cal.starDirections.find((item) => item.star === star);
  if (!row) throw new Error(String(star));
  return row.good;
}

function universal(cal: MonthlyCalendar): string[] {
  const counts = new Map<string, number>();
  for (const row of cal.starDirections) {
    for (const bad of row.bad) {
      const key = `${bad.jp}/${bad.label}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count === cal.starDirections.length)
    .map(([key]) => key)
    .sort();
}

function hasLabel(cal: MonthlyCalendar, label: string): boolean {
  return cal.starDirections.some((row) =>
    row.bad.some((bad) => bad.label === label),
  );
}

function blockedDoyou(cal: MonthlyCalendar): number {
  return cal.days.filter((day) => day.inDoyou && !day.isMabi).length;
}

function dayAt(cal: MonthlyCalendar, day: number) {
  const found = cal.days.find((item) => item.day === day);
  if (!found) throw new Error(`${cal.year}-${cal.month}-${day}`);
  return found;
}

function prevOf(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

function allowedDates(
  cal: MonthlyCalendar,
  prev: MonthlyCalendar,
): Set<string> {
  const allowed = new Set<string>();
  const add = (iso: string) => allowed.add(md(iso));
  add(cal.termStart);
  add(cal.termEnd);
  add(prev.termStart);
  add(prev.termEnd);
  if (cal.doyou) {
    add(cal.doyou.start);
    add(cal.doyou.end);
  }
  for (const term of cal.solarTerms) add(term.atJst.slice(0, 10));
  for (const day of cal.days) add(day.date);
  return allowed;
}

function assertDatesInRange(slug: string, text: string, allowed: Set<string>) {
  for (const match of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    const label = `${Number(match[1])}月${Number(match[2])}日`;
    expect(allowed.has(label), `${slug} の ${label}`).toBe(true);
  }
}

function textNodes(html: string): string[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const article = container.querySelector("article");
  if (!article) throw new Error("article が無い");
  article.querySelectorAll("nav, script, style").forEach((el) => el.remove());
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const nodes: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) nodes.push(text);
  }
  return nodes;
}

/**
 * 骨格（数字を # にした形）が 18 頁すべてにあるノードは地の文で、数字だけを数える。
 * それ以外は可算文字を数える。説明を足す前の計測と同じ手順。
 */
function specificCounts(pages: Map<string, string[]>): Map<string, number> {
  const skeletons = [...pages.values()].map((nodes) => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const skeleton = node.replace(/\d+/g, "#");
      counts.set(skeleton, (counts.get(skeleton) ?? 0) + 1);
    }
    return counts;
  });
  const exacts = [...pages.values()].map((nodes) => {
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(node, (counts.get(node) ?? 0) + 1);
    return counts;
  });
  const skeletonKeys = new Set<string>();
  for (const counts of skeletons)
    for (const key of counts.keys()) skeletonKeys.add(key);
  const commonSkeleton = new Map<string, number>();
  for (const key of skeletonKeys) {
    commonSkeleton.set(
      key,
      Math.min(...skeletons.map((counts) => counts.get(key) ?? 0)),
    );
  }
  const exactKeys = new Set<string>();
  for (const counts of exacts)
    for (const key of counts.keys()) exactKeys.add(key);
  const commonExact = new Map<string, number>();
  for (const key of exactKeys) {
    commonExact.set(
      key,
      Math.min(...exacts.map((counts) => counts.get(key) ?? 0)),
    );
  }
  const out = new Map<string, number>();
  for (const [slug, nodes] of pages) {
    const seenSkeleton = new Map<string, number>();
    const seenExact = new Map<string, number>();
    let specific = 0;
    for (const node of nodes) {
      const skeleton = node.replace(/\d+/g, "#");
      const skeletonUsed = (seenSkeleton.get(skeleton) ?? 0) + 1;
      seenSkeleton.set(skeleton, skeletonUsed);
      if (skeletonUsed <= (commonSkeleton.get(skeleton) ?? 0)) {
        specific += node.match(/\d/g)?.length ?? 0;
        continue;
      }
      const exactUsed = (seenExact.get(node) ?? 0) + 1;
      seenExact.set(node, exactUsed);
      if (exactUsed <= (commonExact.get(node) ?? 0)) continue;
      specific += countChars(node);
    }
    out.set(slug, specific);
  }
  return out;
}

function trigrams(text: string): Set<string> {
  const body = text.replace(/[。、\s]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= body.length; i++) out.add(body.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

describe("月別カレンダーの月固有の説明", () => {
  it("2026-11-12 の18箇月と過不足が無く、広告と索引方針は触らない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00+09:00"));
    expect(calendarMonths().map(calendarMonthSlug)).toEqual(SLUGS);
    expect(SLUGS).toHaveLength(18);
    const source = readFileSync(
      join(__dirname, "../src/app/calendar/[month]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("<AdBanner />");
    expect(source).not.toContain("noindex");
    expect(calendarMonthNote(2028, 5)).toBeNull();
  });

  it("各月の説明は200〜400字で、頁の中宮の段落のあとに出る", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00+09:00"));
    let worst = 0;
    for (let i = 0; i < SLUGS.length; i++) {
      for (let j = i + 1; j < SLUGS.length; j++) {
        const score = jaccard(
          trigrams(CALENDAR_MONTH_NOTES[SLUGS[i]]),
          trigrams(CALENDAR_MONTH_NOTES[SLUGS[j]]),
        );
        if (score > worst) worst = score;
      }
    }
    // 実測の最大は 0.26 前後。定型の月名差し替えはここを超える。
    expect(worst).toBeLessThan(0.35);

    for (const slug of SLUGS) {
      const chars = countChars(CALENDAR_MONTH_NOTES[slug]);
      expect(chars, slug).toBeGreaterThanOrEqual(200);
      expect(chars, slug).toBeLessThanOrEqual(400);
      const page = await CalendarMonthPage({
        params: Promise.resolve({ month: slug }),
      });
      const html = renderToStaticMarkup(page);
      const center = html.indexOf("この期間の中宮は");
      const noteAt = html.indexOf("data-calendar-month-note");
      expect(center, slug).toBeGreaterThan(-1);
      expect(noteAt, slug).toBeGreaterThan(center);
      const container = document.createElement("div");
      container.innerHTML = html;
      expect(
        container.querySelector("[data-calendar-month-note]")?.textContent,
      ).toBe(CALENDAR_MONTH_NOTES[slug]);
      expect(CALENDAR_MONTH_NOTES[slug]).not.toMatch(/運気|健康に|効果がある/);
    }
  });

  it("足した説明は地の文にならず、月固有文字数の差と一致する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00+09:00"));
    const pages = new Map<string, string[]>();
    for (const slug of SLUGS) {
      const page = await CalendarMonthPage({
        params: Promise.resolve({ month: slug }),
      });
      pages.set(slug, textNodes(renderToStaticMarkup(page)));
    }
    const after = specificCounts(pages);
    for (const slug of SLUGS) {
      expect(after.get(slug)! - SPECIFIC_BEFORE[slug], slug).toBe(
        countChars(CALENDAR_MONTH_NOTES[slug]),
      );
    }
  });

  it("窓がずれて説明の無い月でも、頁は説明なしで出る", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T12:00:00+09:00"));
    expect(calendarMonths().map(calendarMonthSlug)).toContain("2028-05");
    const page = await CalendarMonthPage({
      params: Promise.resolve({ month: "2028-05" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("2028年5月の引越しに向く日");
    expect(html).not.toContain("data-calendar-month-note");
  });

  it.each(SLUGS)("%s の数字と日付が月盤・日取りと一致する", (slug) => {
    const [year, month] = slug.split("-").map(Number);
    const cal = buildMonthlyCalendar(year, month);
    const prevRef = prevOf(year, month);
    const prev = buildMonthlyCalendar(prevRef.year, prevRef.month);
    const text = CALENDAR_MONTH_NOTES[slug];
    expect(text).toContain(STAR_NAMES[cal.centerStar]);
    expect(text).toContain(md(cal.termStart));
    expect(text).toContain(md(cal.termEnd));
    expect(text).toContain(STAR_NAMES[prev.centerStar]);
    assertDatesInRange(slug, text, allowedDates(cal, prev));
    checkMonth(slug, text, cal, prev);
  });
});

function checkMonth(
  slug: string,
  text: string,
  cal: MonthlyCalendar,
  prev: MonthlyCalendar,
) {
  const weekend = cal.recommended.filter(
    (day) => day.weekday === 0 || day.weekday === 6,
  );

  switch (slug) {
    case "2026-11": {
      expect(cal.recommended).toHaveLength(9);
      expect(goods(prev, 1)).toEqual(["北東", "東", "南西"]);
      expect(goods(cal, 1)).toEqual(["北", "南"]);
      expect(goods(cal, 6)).toEqual([]);
      expect(universal(cal)).toEqual([
        "北東/暗剣殺",
        "南東/月破",
        "南西/五黄殺",
      ]);
      const ritto = solar(cal, "立冬");
      expect(ritto.atJst.startsWith("2026-11-07")).toBe(true);
      expect(hourOf(ritto.atJst)).toBeGreaterThanOrEqual(12);
      expect(dayAt(cal, 5).rokuyo).toBe("大安");
      expect(dayAt(cal, 5).isMabi).toBe(true);
      expect(WEEK[dayAt(cal, 5).weekday]).toBe("木");
      expect(dayAt(cal, 7).luckyLabels).toEqual(["一粒万倍日"]);
      expect(WEEK[dayAt(cal, 7).weekday]).toBe("土");
      expect(dayAt(cal, 4).rokuyo).toBe("仏滅");
      expect(dayAt(cal, 4).inDoyou && !dayAt(cal, 4).isMabi).toBe(true);
      expect(cal.doyou).toEqual({ start: "2026-10-20", end: "2026-11-06" });
      expect(text).toContain("正午より後");
      break;
    }
    case "2026-12": {
      expect(cal.recommended).toHaveLength(7);
      expect(weekend.map((day) => day.day)).toEqual([27]);
      expect(WEEK[dayAt(cal, 27).weekday]).toBe("日");
      expect(dayAt(cal, 16).rokuyo).toBe("赤口");
      expect(dayAt(cal, 16).luckyLabels).toEqual(["一粒万倍日", "天赦日"]);
      expect(cal.recommended.some((day) => day.day === 16)).toBe(false);
      expect(goods(prev, 8)).toEqual(["東", "北西"]);
      expect(goods(cal, 8)).toEqual([]);
      expect(goods(cal, 4)).toEqual([]);
      expect(cal.doyou).toBeNull();
      const taisetsu = solar(cal, "大雪");
      expect(hourOf(taisetsu.atJst)).toBeLessThan(12);
      expect(taisetsu.atJst.startsWith(cal.termStart)).toBe(true);
      expect(text).toContain("正午より前");
      expect(universal(cal)).toEqual(
        ["南/月破", "東/五黄殺", "西/暗剣殺"].sort(),
      );
      break;
    }
    case "2027-01": {
      const lengths = SLUGS.map((key) => {
        const [y, m] = key.split("-").map(Number);
        return buildMonthlyCalendar(y, m).recommended.length;
      });
      expect(Math.min(...lengths)).toBe(3);
      expect(lengths.filter((n) => n === 3)).toHaveLength(1);
      expect(cal.recommended.map((day) => day.day)).toEqual([2, 9, 13]);
      expect(blockedDoyou(cal)).toBe(12);
      expect(cal.doyou).toEqual({ start: "2027-01-17", end: "2027-02-03" });
      for (const day of [19, 25, 31]) {
        expect(dayAt(cal, day).rokuyo).toBe("大安");
        expect(dayAt(cal, day).inDoyou && !dayAt(cal, day).isMabi).toBe(true);
      }
      expect(
        cal.days.filter((day) => day.isMabi).map((day) => day.day),
      ).toEqual([23, 24, 26]);
      expect(dayAt(cal, 23).rokuyo).toBe("先負");
      expect(dayAt(cal, 24).rokuyo).toBe("仏滅");
      expect(dayAt(cal, 26).rokuyo).toBe("赤口");
      expect(dayAt(cal, 21).luckyLabels).toEqual(["一粒万倍日"]);
      expect(dayAt(cal, 21).inDoyou && !dayAt(cal, 21).isMabi).toBe(true);
      expect(goods(prev, 6)).toEqual(["北東"]);
      expect(goods(cal, 6)).toEqual(["北", "南", "西"]);
      const shokan = solar(cal, "小寒");
      expect(hourOf(shokan.atJst)).toBeGreaterThanOrEqual(18);
      expect(text).toContain("夜");
      break;
    }
    case "2027-02": {
      expect(cal.centerStar).toBe(5);
      expect(hasLabel(cal, "五黄殺")).toBe(false);
      expect(hasLabel(cal, "暗剣殺")).toBe(false);
      expect(universal(cal)).toEqual(["南西/月破"]);
      expect(STAR_MEANINGS[5].good).toContain("吉方位としての働きはありません");
      const risshun = solar(cal, "立春");
      expect(risshun.atJst.startsWith("2027-02-04")).toBe(true);
      expect(hourOf(risshun.atJst)).toBeLessThan(12);
      expect(cal.termStart).toBe("2027-02-04");
      expect(dayAt(cal, 2).inDoyou && !dayAt(cal, 2).isMabi).toBe(true);
      expect(dayAt(cal, 2).rokuyo).toBe("先勝");
      expect(cal.recommended.every((day) => day.day >= 8)).toBe(true);
      expect(cal.recommended).toHaveLength(6);
      expect(dayAt(cal, 28).rokuyo).toBe("大安");
      expect(dayAt(cal, 28).luckyLabels).toEqual(["天赦日"]);
      expect(WEEK[dayAt(cal, 28).weekday]).toBe("日");
      const counts = cal.starDirections.map((row) => row.good.length);
      expect(Math.max(...counts)).toBe(4);
      expect(goods(cal, 1)).toHaveLength(4);
      expect(counts.filter((n) => n === 4)).toHaveLength(1);
      break;
    }
    case "2027-03": {
      expect(cal.doyou).toBeNull();
      const taian = cal.days.filter((day) => day.rokuyo === "大安");
      expect(taian.map((day) => day.day)).toEqual([6, 11, 17, 23, 29]);
      expect(taian.every((day) => !day.inDoyou)).toBe(true);
      expect(cal.recommended).toHaveLength(8);
      expect(weekend).toHaveLength(1);
      expect(weekend[0].day).toBe(6);
      expect(goods(prev, 1)).toHaveLength(4);
      expect(goods(cal, 1)).toEqual([]);
      for (const day of [7, 12, 24])
        expect(dayAt(cal, day).rokuyo).toBe("赤口");
      expect(hourOf(solar(cal, "啓蟄").atJst)).toBeLessThan(12);
      expect(universal(cal)).toEqual(
        ["北西/五黄殺", "南東/暗剣殺", "西/月破"].sort(),
      );
      break;
    }
    case "2027-04": {
      expect(dayAt(cal, 29).luckyLabels).toEqual(["天赦日"]);
      expect(dayAt(cal, 29).rokuyo).toBe("先勝");
      expect(dayAt(cal, 29).inDoyou && !dayAt(cal, 29).isMabi).toBe(true);
      expect(blockedDoyou(cal)).toBe(11);
      expect(cal.doyou?.start).toBe("2027-04-17");
      expect(dayAt(cal, 27).rokuyo).toBe("大安");
      expect(dayAt(cal, 27).luckyLabels).toContain("一粒万倍日");
      expect(dayAt(cal, 21).isMabi).toBe(true);
      expect(dayAt(cal, 21).rokuyo).toBe("大安");
      expect(WEEK[dayAt(cal, 21).weekday]).toBe("水");
      expect(cal.recommended.map((day) => day.day)).toEqual([4, 6, 9, 15, 21]);
      expect(weekend.map((day) => day.day)).toEqual([4]);
      expect(goods(prev, 1)).toEqual([]);
      expect(goods(cal, 1)).toEqual(["北東", "南"]);
      expect(hourOf(solar(cal, "清明").atJst)).toBeLessThan(12);
      break;
    }
    case "2027-05": {
      expect(dayAt(cal, 3).rokuyo).toBe("大安");
      expect(dayAt(cal, 3).isMabi).toBe(true);
      expect(WEEK[dayAt(cal, 3).weekday]).toBe("月");
      expect(dayAt(cal, 15).luckyLabels).toEqual(["天赦日"]);
      expect(dayAt(cal, 15).rokuyo).toBe("先勝");
      expect(WEEK[dayAt(cal, 15).weekday]).toBe("土");
      expect(cal.recommended.some((day) => day.day === 15)).toBe(true);
      for (const day of [12, 24]) expect(dayAt(cal, day).rokuyo).toBe("仏滅");
      expect(goods(prev, 9)).toEqual(["北", "南東"]);
      expect(goods(cal, 9)).toEqual([]);
      expect(hourOf(solar(cal, "立夏").atJst)).toBeLessThan(12);
      break;
    }
    case "2027-06": {
      const cluster = [5, 7, 8, 19, 20];
      for (const day of cluster) {
        expect(dayAt(cal, day).luckyLabels).toEqual(["一粒万倍日"]);
        expect(["仏滅", "赤口"]).not.toContain(dayAt(cal, day).rokuyo);
        expect(cal.recommended.some((item) => item.day === day)).toBe(true);
      }
      expect(cal.recommended).toHaveLength(9);
      expect(weekend.map((day) => day.day)).toEqual([5, 19, 20]);
      expect(cal.termEnd.startsWith("2027-07")).toBe(true);
      expect(cal.doyou).toBeNull();
      expect(cal.starDirections.every((row) => row.good.length > 0)).toBe(true);
      expect(goods(cal, 2)).toEqual(["南西"]);
      expect(goods(cal, 3)).toEqual(["南東"]);
      expect(goods(cal, 4)).toEqual(["南東"]);
      expect(goods(prev, 9)).toEqual([]);
      expect(goods(cal, 9)).toEqual(["北東", "東", "西"]);
      expect(hasLabel(cal, "月破")).toBe(false);
      expect(hourOf(solar(cal, "芒種").atJst)).toBeLessThan(12);
      break;
    }
    case "2027-07": {
      expect(dayAt(cal, 14).luckyLabels).toEqual(["一粒万倍日", "天赦日"]);
      expect(dayAt(cal, 14).rokuyo).toBe("仏滅");
      expect(cal.recommended.some((day) => day.day === 14)).toBe(false);
      expect(dayAt(cal, 1).luckyLabels).toEqual(["一粒万倍日"]);
      expect(dayAt(cal, 2).luckyLabels).toEqual(["一粒万倍日"]);
      for (const day of [21, 27]) {
        expect(dayAt(cal, day).rokuyo).toBe("大安");
        expect(dayAt(cal, day).inDoyou && !dayAt(cal, day).isMabi).toBe(true);
      }
      expect(
        cal.days.filter((day) => day.isMabi).map((day) => day.rokuyo),
      ).toEqual(["先勝", "友引", "赤口"]);
      expect(cal.recommended.map((day) => day.day)).toEqual([1, 2, 9, 15, 17]);
      expect(goods(cal, 4)).toEqual(["北西"]);
      expect(hourOf(solar(cal, "小暑").atJst)).toBeGreaterThanOrEqual(12);
      expect(text).toContain("午後");
      break;
    }
    case "2027-08": {
      const november = buildMonthlyCalendar(2026, 11);
      expect(november.centerStar).toBe(cal.centerStar);
      expect(universal(november)).toContain("南東/月破");
      expect(hasLabel(cal, "月破")).toBe(false);
      expect(goods(november, 6)).toEqual([]);
      expect(goods(cal, 6)).toEqual([]);
      expect(goods(prev, 6)).toEqual(["南東", "西", "北西"]);
      expect(dayAt(cal, 6).rokuyo).toBe("大安");
      expect(dayAt(cal, 6).inDoyou && !dayAt(cal, 6).isMabi).toBe(true);
      expect(dayAt(cal, 7).rokuyo).toBe("赤口");
      expect(dayAt(cal, 7).luckyLabels).toEqual(["一粒万倍日"]);
      expect(cal.recommended.every((day) => day.day >= 8)).toBe(true);
      expect(weekend.map((day) => day.day)).toEqual([8]);
      expect(dayAt(cal, 8).rokuyo).toBe("先勝");
      expect(hourOf(solar(cal, "立秋").atJst)).toBeLessThan(12);
      expect(text).toContain("2026年11月");
      break;
    }
    case "2027-09": {
      expect(dayAt(cal, 26).luckyLabels).toEqual(["一粒万倍日", "天赦日"]);
      expect(dayAt(cal, 26).rokuyo).toBe("先負");
      expect(WEEK[dayAt(cal, 26).weekday]).toBe("日");
      expect(cal.recommended).toHaveLength(9);
      const nines = SLUGS.filter((key) => {
        const [y, m] = key.split("-").map(Number);
        return buildMonthlyCalendar(y, m).recommended.length === 9;
      });
      expect(nines).toEqual(["2026-11", "2027-06", "2027-09", "2027-11"]);
      const december = buildMonthlyCalendar(2026, 12);
      expect(december.centerStar).toBe(cal.centerStar);
      expect(goods(december, 4)).toEqual([]);
      expect(goods(december, 8)).toEqual([]);
      expect(goods(cal, 4)).toEqual([]);
      expect(goods(cal, 8)).toEqual([]);
      expect(hasLabel(december, "月破")).toBe(true);
      expect(hasLabel(cal, "月破")).toBe(false);
      expect(goods(cal, 9)).toEqual(["北", "南", "南西", "北西"]);
      expect(cal.doyou).toBeNull();
      expect(hourOf(solar(cal, "白露").atJst)).toBeLessThan(12);
      break;
    }
    case "2027-10": {
      const before = cal.recommended.filter((day) => day.date < cal.termStart);
      expect(before.map((day) => day.day)).toEqual([2, 8]);
      expect(before.every((day) => day.rokuyo === "大安")).toBe(true);
      expect(WEEK[dayAt(cal, 2).weekday]).toBe("土");
      expect(WEEK[dayAt(cal, 8).weekday]).toBe("金");
      expect(dayAt(cal, 26).rokuyo).toBe("大安");
      expect(dayAt(cal, 30).rokuyo).toBe("大安");
      expect(dayAt(cal, 30).luckyLabels).toContain("一粒万倍日");
      expect(dayAt(cal, 26).inDoyou && !dayAt(cal, 26).isMabi).toBe(true);
      expect(dayAt(cal, 30).inDoyou && !dayAt(cal, 30).isMabi).toBe(true);
      expect(
        cal.days.filter((day) => day.isMabi).map((day) => day.rokuyo),
      ).toEqual(["赤口", "友引", "赤口"]);
      expect(dayAt(cal, 18).luckyLabels).toEqual(["一粒万倍日"]);
      expect(dayAt(cal, 18).rokuyo).toBe("先負");
      expect(WEEK[dayAt(cal, 18).weekday]).toBe("月");
      expect(cal.recommended).toHaveLength(5);
      expect(weekend).toHaveLength(1);
      expect(goods(prev, 9)).toHaveLength(4);
      expect(goods(cal, 9)).toEqual(["北", "東", "西"]);
      expect(hourOf(solar(cal, "寒露").atJst)).toBeGreaterThanOrEqual(18);
      expect(hasLabel(cal, "月破")).toBe(false);
      break;
    }
    case "2027-11": {
      const february = buildMonthlyCalendar(2027, 2);
      expect(cal.centerStar).toBe(5);
      expect(february.centerStar).toBe(5);
      expect(hasLabel(cal, "五黄殺")).toBe(false);
      expect(hasLabel(cal, "暗剣殺")).toBe(false);
      expect(universal(cal)).toEqual(["南東/月破"]);
      expect(universal(february)).toEqual(["南西/月破"]);
      const ritto = solar(cal, "立冬");
      expect(hourOf(ritto.atJst)).toBe(0);
      expect(ritto.atJst.startsWith(cal.termStart)).toBe(true);
      const ritto2026 = solar(buildMonthlyCalendar(2026, 11), "立冬");
      expect(ritto2026.atJst.startsWith("2026-11-07")).toBe(true);
      expect(hourOf(ritto2026.atJst)).toBeGreaterThanOrEqual(12);
      expect(dayAt(cal, 2).isMabi).toBe(true);
      expect(dayAt(cal, 2).rokuyo).toBe("友引");
      expect(dayAt(cal, 2).luckyLabels).toEqual(["一粒万倍日"]);
      expect(WEEK[dayAt(cal, 2).weekday]).toBe("火");
      expect(dayAt(cal, 5).rokuyo).toBe("大安");
      expect(dayAt(cal, 5).inDoyou && !dayAt(cal, 5).isMabi).toBe(true);
      expect(cal.recommended).toHaveLength(9);
      expect(weekend.map((day) => day.day)).toEqual([14, 27, 28]);
      break;
    }
    case "2027-12": {
      expect(cal.recommended.map((day) => day.day)).toEqual([4, 10, 16, 22]);
      expect(cal.recommended.every((day) => day.rokuyo === "大安")).toBe(true);
      expect(weekend.map((day) => day.day)).toEqual([4]);
      const thisYear = solar(cal, "大雪");
      const lastYear = solar(buildMonthlyCalendar(2026, 12), "大雪");
      expect(hourOf(thisYear.atJst)).toBeGreaterThanOrEqual(12);
      expect(hourOf(lastYear.atJst)).toBeLessThan(12);
      expect(lastYear.atJst.startsWith("2026-12-07")).toBe(true);
      expect(cal.termStart).toBe("2027-12-08");
      expect(dayAt(cal, 11).luckyLabels).toEqual(["一粒万倍日", "天赦日"]);
      expect(dayAt(cal, 11).rokuyo).toBe("赤口");
      expect(cal.doyou).toBeNull();
      expect(goods(prev, 7)).toEqual(["北", "北東", "南西"]);
      expect(goods(cal, 7)).toEqual(["東"]);
      expect(goods(cal, 1)).toEqual(["西"]);
      expect(text).toContain("午後");
      break;
    }
    case "2028-01": {
      expect(weekend.map((day) => day.day)).toEqual([2, 8, 16, 30]);
      const weekends = SLUGS.map((key) => {
        const [y, m] = key.split("-").map(Number);
        return buildMonthlyCalendar(y, m).recommended.filter(
          (day) => day.weekday === 0 || day.weekday === 6,
        ).length;
      });
      expect(Math.max(...weekends)).toBe(4);
      expect(weekends.filter((n) => n === 4)).toHaveLength(2);
      expect(dayAt(cal, 20).rokuyo).toBe("大安");
      expect(dayAt(cal, 20).inDoyou && !dayAt(cal, 20).isMabi).toBe(true);
      expect(dayAt(cal, 30).rokuyo).toBe("大安");
      expect(dayAt(cal, 30).isMabi).toBe(true);
      expect(WEEK[dayAt(cal, 30).weekday]).toBe("日");
      const january2027 = buildMonthlyCalendar(2027, 1);
      expect(
        january2027.days
          .filter((day) => day.isMabi)
          .some((day) => day.rokuyo === "大安"),
      ).toBe(false);
      expect(january2027.recommended).toHaveLength(3);
      expect(goods(cal, 3)).toEqual([]);
      expect(goods(cal, 4)).toEqual([]);
      expect(hourOf(solar(cal, "小寒").atJst)).toBeLessThan(12);
      break;
    }
    case "2028-02": {
      expect(cal.days).toHaveLength(29);
      const risshun = solar(cal, "立春");
      const previous = solar(buildMonthlyCalendar(2027, 2), "立春");
      expect(hourOf(risshun.atJst)).toBeGreaterThanOrEqual(12);
      expect(hourOf(previous.atJst)).toBeLessThan(12);
      expect(previous.atJst.startsWith("2027-02-04")).toBe(true);
      expect(cal.termStart).toBe("2028-02-05");
      expect(risshun.atJst.startsWith("2028-02-04")).toBe(true);
      expect(dayAt(cal, 2).isMabi).toBe(true);
      expect(dayAt(cal, 2).rokuyo).toBe("友引");
      expect(dayAt(cal, 2).luckyLabels).toEqual([]);
      expect(cal.recommended.some((day) => day.day === 2)).toBe(false);
      expect(cal.recommended[0].day).toBe(5);
      expect(dayAt(cal, 5).rokuyo).toBe("大安");
      expect(WEEK[dayAt(cal, 5).weekday]).toBe("土");
      expect(dayAt(cal, 23).rokuyo).toBe("大安");
      expect(dayAt(cal, 23).luckyLabels).toEqual(["天赦日"]);
      expect(WEEK[dayAt(cal, 23).weekday]).toBe("水");
      expect(goods(prev, 9)).toEqual(["北", "南東", "北西"]);
      expect(goods(cal, 9)).toEqual(["北西"]);
      expect(hasLabel(cal, "月破")).toBe(false);
      expect(text).toContain("午後");
      break;
    }
    case "2028-03": {
      expect(cal.termStart).toBe("2028-03-05");
      expect(dayAt(cal, 5).rokuyo).toBe("大安");
      expect(WEEK[dayAt(cal, 5).weekday]).toBe("日");
      expect(cal.recommended.some((day) => day.date < cal.termStart)).toBe(
        false,
      );
      expect(cal.recommended).toHaveLength(8);
      expect(weekend.map((day) => day.day)).toEqual([5, 11, 25]);
      for (const day of [6, 18]) expect(dayAt(cal, day).rokuyo).toBe("赤口");
      expect(cal.doyou).toBeNull();
      const june = buildMonthlyCalendar(2027, 6);
      expect(june.centerStar).toBe(cal.centerStar);
      expect(hasLabel(june, "月破")).toBe(false);
      expect(universal(cal)).toContain("西/月破");
      expect(goods(june, 1)).toContain("西");
      expect(goods(cal, 1)).toEqual(["北東", "南西"]);
      expect(hourOf(solar(cal, "啓蟄").atJst)).toBeLessThan(12);
      break;
    }
    case "2028-04": {
      expect(goods(cal, 3)).toEqual([]);
      expect(goods(cal, 4)).toEqual([]);
      const seimei = solar(cal, "清明");
      const last = solar(buildMonthlyCalendar(2027, 4), "清明");
      expect(seimei.atJst.startsWith("2028-04-04")).toBe(true);
      expect(hourOf(seimei.atJst)).toBeGreaterThanOrEqual(12);
      expect(last.atJst.startsWith("2027-04-05")).toBe(true);
      expect(hourOf(last.atJst)).toBeLessThan(12);
      expect(buildMonthlyCalendar(2027, 4).centerStar).toBe(3);
      expect(dayAt(cal, 3).rokuyo).toBe("大安");
      expect(WEEK[dayAt(cal, 3).weekday]).toBe("月");
      expect(dayAt(cal, 3).date < cal.termStart).toBe(true);
      expect(dayAt(cal, 21).rokuyo).toBe("大安");
      expect(dayAt(cal, 21).luckyLabels).toContain("一粒万倍日");
      expect(dayAt(cal, 21).inDoyou && !dayAt(cal, 21).isMabi).toBe(true);
      expect(dayAt(cal, 23).luckyLabels).toEqual(["天赦日"]);
      expect(dayAt(cal, 23).rokuyo).toBe("先勝");
      expect(WEEK[dayAt(cal, 23).weekday]).toBe("日");
      expect(dayAt(cal, 23).inDoyou && !dayAt(cal, 23).isMabi).toBe(true);
      expect(dayAt(cal, 26).isMabi).toBe(true);
      expect(dayAt(cal, 26).rokuyo).toBe("大安");
      expect(WEEK[dayAt(cal, 26).weekday]).toBe("水");
      expect(cal.recommended.map((day) => day.day)).toEqual([3, 9, 12, 15, 26]);
      expect(cal.doyou).toEqual({ start: "2028-04-16", end: "2028-05-04" });
      expect(text).toContain("午後");
      break;
    }
    default:
      throw new Error(`未検証の月: ${slug}`);
  }
}
