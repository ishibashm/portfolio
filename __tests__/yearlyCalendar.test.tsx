import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/calendar/[month]/page";
import { calendarMonthSlug, calendarMonths } from "@/lib/calendarMonths";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";
import {
  buildYearlyCalendar,
  eraYearLabel,
  yearlyCalendarFaq,
  yearlyCalendarLlmsLines,
} from "@/lib/yearlyCalendar";

vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));

/**
 * 年間の日取り一覧（/calendar/2027）。
 *
 * 見たいのは 3 つ。
 *   1. 年の頁の数字が、月の頁（buildMonthlyCalendar）と同じ答えになること
 *   2. FAQ の文が集計から組まれていて、暦と食い違わないこと
 *   3. 同じ段に来る「年」と「月」の綴りが取り違えられないこと
 */

// 頁は「今年から 3 年」を対象にする。実行日に依らないよう時刻を止める。
const NOW = new Date("2026-11-14T03:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

const dates = (days: { date: string }[]) => days.map((d) => d.date);

describe("buildYearlyCalendar", () => {
  it("2027 年の天赦日は 6 日で、六曜と土用をくぐるのは 2 日（記事と同じ答え）", () => {
    const cal = buildYearlyCalendar(2027);
    expect(cal.tensha.map((t) => t.day.date)).toEqual([
      "2027-02-28",
      "2027-04-29",
      "2027-05-15",
      "2027-07-14",
      "2027-09-26",
      "2027-12-11",
    ]);
    // 2/28 は仏滅（日本の暦。六曜の旧暦を日本時間の朔で数える）。
    expect(cal.tensha.filter((t) => t.usable).map((t) => t.day.date)).toEqual([
      "2027-05-15",
      "2027-09-26",
    ]);
  });

  it.each([2026, 2027, 2028])(
    "%d 年: 向く日・一粒万倍日・大安が月の頁と 1 日も違わない",
    (year) => {
      const cal = buildYearlyCalendar(year);
      expect(cal.months).toHaveLength(12);
      let recommended = 0;
      for (const m of cal.months) {
        const month = buildMonthlyCalendar(year, m.month);
        expect(dates(m.recommended)).toEqual(dates(month.recommended));
        expect(dates(m.ichiryumanbai)).toEqual(
          dates(month.days.filter((d) => d.luckyLabels.includes("一粒万倍日"))),
        );
        expect(dates(m.taian)).toEqual(
          dates(month.days.filter((d) => d.rokuyo === "大安")),
        );
        recommended += month.recommended.length;
      }
      expect(cal.totals.recommended).toBe(recommended);
    },
  );

  it.each([2026, 2027, 2028])(
    "%d 年: 候補に入らない天赦日には、暦の上の理由がある",
    (year) => {
      const cal = buildYearlyCalendar(year);
      expect(cal.tensha.length).toBeGreaterThanOrEqual(5);
      expect(cal.tensha.length).toBeLessThanOrEqual(6);
      for (const t of cal.tensha) {
        const blockedByRokuyo = ["仏滅", "赤口"].includes(t.day.rokuyo);
        const blockedByDoyou = t.day.inDoyou && !t.day.isMabi;
        // 理由が「条件を満たさない」に落ちたら、月の頁の条件が増えたのに
        // こちらの言い分けが追いついていない。
        expect(t.usable).toBe(!blockedByRokuyo && !blockedByDoyou);
        if (t.usable) expect(t.reason).toBeNull();
        else expect(t.reason).not.toBe("条件を満たさない");
      }
    },
  );

  it.each([2026, 2027, 2028])(
    "%d 年: 土用は 4 回で、どれもその年に始まり、重ならない",
    (year) => {
      const { doyou } = buildYearlyCalendar(year);
      expect(doyou).toHaveLength(4);
      for (const [i, p] of doyou.entries()) {
        expect(p.start.startsWith(`${year}-`)).toBe(true);
        expect(p.start < p.end).toBe(true);
        if (i > 0) expect(doyou[i - 1].end < p.start).toBe(true);
      }
    },
  );

  it("年盤で全員に凶の方位は、五黄殺・暗剣殺・歳破だけを拾う", () => {
    // 2027 年（九紫中宮・未年）: 北に五黄、南が暗剣殺、歳破は丑の方位。
    expect(buildYearlyCalendar(2027).sharedBad).toEqual([
      { jp: "北", label: "五黄殺" },
      { jp: "南", label: "暗剣殺" },
      { jp: "北東", label: "歳破" },
    ]);
    for (const year of [2026, 2028]) {
      for (const b of buildYearlyCalendar(year).sharedBad) {
        expect(["五黄殺", "暗剣殺", "歳破"]).toContain(b.label);
      }
    }
  });
});

describe("yearlyCalendarFaq", () => {
  it("答えの日付と数は集計と一致する", () => {
    const cal = buildYearlyCalendar(2027);
    const faq = yearlyCalendarFaq(cal);
    expect(faq).toHaveLength(4);
    const [tensha, double, doyou, direction] = faq.map((f) => f.answer);

    expect(tensha).toContain("の6日です");
    expect(tensha).toContain("2月28日（日・仏滅）");
    expect(tensha).toContain("9月26日（日・先負）の2日です");

    // 重なる 3 日のうち、仏滅・赤口でないのは 9/26 だけ。
    expect(double).toContain("の3日です");
    expect(double).toContain("7月14日（水・仏滅）");
    expect(double).toMatch(/残るのは、9月26日（日・先負）です。$/);

    expect(doyou).toContain("1月17日〜2月3日");
    expect(doyou).toContain("の4回です");

    expect(direction).toContain("北（五黄殺）・南（暗剣殺）・北東（歳破）");
  });

  it("FAQPage の答えは 30〜300 字に収まる（抜粋で切られない長さ）", () => {
    for (const year of [2026, 2027, 2028]) {
      for (const f of yearlyCalendarFaq(buildYearlyCalendar(year))) {
        expect(f.answer.length).toBeGreaterThanOrEqual(30);
        expect(f.answer.length).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe("/calendar/{年} の頁", () => {
  const render = async (slug: string) =>
    renderToStaticMarkup(
      await CalendarPage({ params: Promise.resolve({ month: slug }) }),
    );

  it("年の綴りは年の頁、月の綴りは月の頁になる", async () => {
    vi.useFakeTimers({ now: NOW });
    const year = await render("2027");
    expect(year).toContain(
      `<h1 class="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">${eraYearLabel(2027)}の天赦日・一粒万倍日と、引越しに向く日</h1>`,
    );
    expect(year).toContain('"@type":"FAQPage"');

    const month = await render("2027-03");
    expect(month).toContain("2027年3月の引越しに向く日");
    expect(month).not.toContain('"@type":"FAQPage"');
  });

  it("FAQPage に入れた問答は、頁の本文にも同じ文で出ている", async () => {
    vi.useFakeTimers({ now: NOW });
    const html = await render("2027");
    for (const f of yearlyCalendarFaq(buildYearlyCalendar(2027))) {
      expect(html).toContain(`>${f.question}</dt>`);
      expect(html).toContain(`>${f.answer}</dd>`);
    }
  });

  it("月の頁へのリンクは、実在する月（今月から 18 か月）にだけ張る", async () => {
    vi.useFakeTimers({ now: NOW });
    const exists = new Set(calendarMonths().map(calendarMonthSlug));
    for (const year of [2026, 2027, 2028]) {
      const html = await render(String(year));
      const linked = [
        ...html.matchAll(/href="\/calendar\/(\d{4}-\d{2})"/g),
      ].map((m) => m[1]);
      for (const slug of linked) expect(exists.has(slug)).toBe(true);
      // 張れる月には張っている（2026 は 11・12 月、2027 は全部、2028 は 1〜4 月）。
      const expected = [...exists].filter((s) => s.startsWith(`${year}-`));
      expect(new Set(linked)).toEqual(new Set(expected));
    }
  });

  it("対象外の年は 404、対象の年は事前生成と canonical を持つ", async () => {
    vi.useFakeTimers({ now: NOW });
    await expect(render("2025")).rejects.toThrow();
    await expect(render("2029")).rejects.toThrow();

    const params = generateStaticParams().map((p) => p.month);
    expect(params).toEqual(expect.arrayContaining(["2026", "2027", "2028"]));
    expect(params).toContain("2027-03");

    const meta = await generateMetadata({
      params: Promise.resolve({ month: "2027" }),
    });
    expect(meta.alternates?.canonical).toBe("/calendar/2027");
    expect(meta.description).toContain("の6日");
    expect(meta.description).toContain("このうち2日");
  });
});

describe("llms-full.txt の年ごとの日取り", () => {
  it("頁を開かずに引けるよう、日付そのものが 1 行ずつ入る", () => {
    const text = yearlyCalendarLlmsLines(
      buildYearlyCalendar(2027),
      "https://cloud-palette.com",
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe(
      "### 2027年（https://cloud-palette.com/calendar/2027）",
    );
    expect(lines).toHaveLength(6);
    // 箇条書きが割れないこと（答えの文に改行が無い）。
    for (const line of lines.slice(1)) expect(line.startsWith("- ")).toBe(true);
    expect(text).toContain("2月28日（日・仏滅）");
    const { totals } = buildYearlyCalendar(2027);
    expect(totals.ichiryumanbai).toBe(60);
    expect(text).toContain(
      `一粒万倍日 60 日、大安 ${totals.taian} 日。仏滅・赤口と土用（間日を除く）を外した「引越しに向く日」は ${totals.recommended} 日。`,
    );
    expect(text).toContain("北（五黄殺）・南（暗剣殺）・北東（歳破）");
  });
});
