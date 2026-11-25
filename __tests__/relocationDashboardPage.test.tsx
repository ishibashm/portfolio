import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/relocation/dashboard/page";
import { buildRelocationDashboardSummary } from "@/lib/relocationDashboardSummary";
import { SITE_URL } from "@/lib/siteUrl";
import { buildCurrentDirections, buildTodayBoard } from "@/lib/todayDirections";

vi.mock("@/app/relocation/dashboard/DashboardTool", () => ({
  default: () => <p>読み込んでいます…</p>,
}));

const sample = new Date("2026-11-23T12:00:00+09:00");

describe("relocation dashboard summary", () => {
  it.each([sample, new Date("2026-11-23T00:01:00+09:00")])(
    "matches the day board and current solar-hour boundaries at %s",
    (now) => {
      const daily = buildTodayBoard(now);
      const current = buildCurrentDirections(now, undefined, 139.6917);
      expect(buildRelocationDashboardSummary(now)).toEqual({
        date: daily.date,
        common: daily.common,
        branch: current.branch,
        start: current.start,
        end: current.end,
      });
      expect(current.date).toBe(daily.date);
    },
  );
});

it("renders the summary, guide, headings, links and matching JSON-LD in the initial HTML", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(sample);
    const html = renderToStaticMarkup(<DashboardPage />);
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(
      [...doc.querySelectorAll("h1, h2")].map((h) => h.textContent),
    ).toEqual([
      "出発地と目的地で方位を確かめる",
      "今日の要約",
      "この画面で分かること",
      "生年月日と場所を入れる",
      "いまの要点",
      "計算の基準",
      "よくある質問",
      "次に見る",
    ]);
    expect(doc.querySelector("[data-guide-pose]")).not.toBeNull();
    const summary = buildRelocationDashboardSummary(sample);
    const summarySection = doc.querySelector("section");
    expect(summarySection?.querySelector("time")?.textContent).toBe(
      summary.date,
    );
    expect(summarySection?.textContent).toContain(`${summary.branch}の刻`);
    expect(summarySection?.querySelectorAll("time")[1]?.dateTime).toBe(
      summary.end,
    );
    expect(summary.common.length).toBeGreaterThan(0);
    for (const { label, reason } of summary.common) {
      expect(summarySection?.textContent).toContain(`${label}（${reason}）`);
    }
    for (const href of [
      "/houi/today",
      "/blog/todays-lucky-direction-by-hour",
      "/guide/honmei",
    ]) {
      expect(
        doc.querySelector(`section:last-child a[href="${href}"]`),
      ).not.toBeNull();
    }

    const [webPage, faqPage] = [
      ...doc.querySelectorAll('script[type="application/ld+json"]'),
    ].map((script) => JSON.parse(script.textContent ?? ""));
    expect(webPage).toMatchObject({
      "@type": "WebPage",
      url: `${SITE_URL}/relocation/dashboard`,
      name: "出発地と目的地で方位を確かめる｜行き先がいま使えるかを判定",
      description: expect.stringContaining("占い上の目安"),
      inLanguage: "ja",
      publisher: { "@id": `${SITE_URL}/#organization` },
    });
    expect(faqPage["@type"]).toBe("FAQPage");
    const faq = [
      ...doc.querySelectorAll(
        "section:nth-last-child(2) dt, section:nth-last-child(2) dd",
      ),
    ];
    expect(
      faq
        .filter((item) => item.tagName === "DT")
        .map((item) => item.textContent),
    ).toEqual([
      "今日、誰にとっても避けたい方位はありますか？",
      "いまの刻はいつまでで、次の刻はいつからですか？ 真太陽時とは何ですか？",
      "本命星が分からないときはどうすればよいですか？",
      "「今日の吉方位 時間別一覧」とはどう違いますか？",
      "目的地を入れると何が分かりますか？",
      "引っ越しの日取りは日盤だけで選べますか？",
    ]);
    expect(
      faqPage.mainEntity.flatMap(
        (item: { name: string; acceptedAnswer: { text: string } }) => [
          item.name,
          item.acceptedAnswer.text,
        ],
      ),
    ).toEqual(faq.map((item) => item.textContent));
  } finally {
    vi.useRealTimers();
  }
});
