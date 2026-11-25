// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STAR_NAMES, STARS } from "@/lib/kigakuContent";
import { buildTodayDirections } from "@/lib/todayDirections";
import { primaryPageFor } from "@/lib/articlePrimaryPage";

vi.mock("@/components/houi/CurrentDirections", () => ({
  CurrentDirections: () => null,
}));
vi.mock("@/components/relocation/ActiveProfileBadge", () => ({
  ActiveProfileBadge: () => null,
}));

const NOW = new Date("2026-11-25T03:00:00Z");

afterEach(() => vi.useRealTimers());

const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");

describe("/houi/today: 本命星を選ぶ前に時間帯ごとの表が見える", () => {
  it("初期表示で、十二支12行×本命星9列の吉方位の表を、生まれ年の入力欄より前に出す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { default: TodayPage } = await import("@/app/houi/today/page");
    const html = renderToStaticMarkup(await TodayPage());
    const doc = parse(html);
    const section = doc.querySelector(
      'section[aria-labelledby="hours-overview-heading"]',
    )!;
    expect(section).not.toBeNull();
    // details の外（開かなくても見える）にある。
    expect(section.closest("details")).toBeNull();
    expect(section.querySelector("h2")?.textContent).toContain("時間別");
    const rows = [...section.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(12);
    const heads = [...section.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    );
    expect(heads.slice(0, 3)).toEqual([
      "刻・日本時間",
      "時盤中宮",
      "全員に避けたい方位",
    ]);
    expect(heads.slice(3)).toEqual(STARS.map((s) => `${STAR_NAMES[s]}の吉`));

    // 表の中身は既存の計算（星別の時間表）と一致する。
    const data = buildTodayDirections(NOW);
    rows.forEach((row, index) => {
      const cells = [...row.querySelectorAll("td")].map((td) => td.textContent);
      const hour = data.stars[0].hours[index];
      expect(row.querySelector("th")?.textContent).toContain(hour.branch);
      expect(cells[0]).toBe(hour.center);
      expect(cells[1]).toBe(hour.common.unlucky.join("・") || "なし");
      data.stars.forEach((star, i) => {
        expect(cells[2 + i]).toBe(star.hours[index].lucky.join("・") || "なし");
      });
    });

    expect(html.indexOf("hours-overview-heading")).toBeLessThan(
      html.indexOf('name="birthYear"'),
    );
    // 既存の星別の折りたたみ表は残っている。
    expect(doc.querySelectorAll('details[name="honmei"]')).toHaveLength(9);
    expect(html).toContain("真太陽時");
  });
});

describe("/relocation/dashboard: 時間別の検索語と重ならず、/houi/today へ誘導する", () => {
  it("題・説明文・見出しに「時間別」を使わず、先頭に /houi/today への目立つリンクを置く", async () => {
    vi.doMock("@/components/fortune/FortuneReport", () => ({
      FortuneReport: () => null,
    }));
    const { metadata } = await import("@/app/relocation/dashboard/layout");
    const { default: DashboardPage } =
      await import("@/app/relocation/dashboard/page");
    expect(String(metadata.title)).not.toContain("時間別");
    expect(String(metadata.title)).not.toContain("今日の方位と時間");
    expect(metadata.description).not.toContain("時間別");
    const doc = parse(renderToStaticMarkup(<DashboardPage />));
    expect(doc.querySelector("h1")?.textContent).toBe(
      "出発地と目的地で方位を確かめる",
    );
    const firstLink = doc.querySelector('a[href="/houi/today"]')!;
    const h1 = doc.querySelector("h1")!;
    expect(firstLink.textContent).toBe("今日の吉方位 時間別一覧");
    // h1 の直後の案内文の中にある（本文の奥ではない）。
    expect(h1.nextElementSibling?.contains(firstLink)).toBe(true);
  });
});

describe("blog/todays-lucky-direction-by-hour: 301 にせず、冒頭から /houi/today へ誘導する", () => {
  it("slug ごとの誘導先を持ち、他の記事には出さない", () => {
    expect(primaryPageFor("todays-lucky-direction-by-hour")).toMatchObject({
      href: "/houi/today",
    });
    expect(primaryPageFor("five-yellow-and-anken-satsu")).toBeNull();
    expect(primaryPageFor("constructor")).toBeNull();
  });
  it("redirects に入れていない（DB 由来の記事を壊さない）", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).not.toContain(
      'source: "/blog/todays-lucky-direction-by-hour"',
    );
    expect(
      existsSync(
        join(process.cwd(), "content/blog/todays-lucky-direction-by-hour.md"),
      ),
    ).toBe(true);
  });
});

describe("blog/todays-lucky-direction-by-hour: 記事の頁の冒頭", () => {
  it("DB 由来の本文でも、冒頭に /houi/today への誘導を出し、canonical は記事自身", async () => {
    vi.resetModules();
    const post = {
      slug: "todays-lucky-direction-by-hour",
      title: "今日の吉方位と時間帯はどう読むか",
      description: "説明",
      body: "## 先に結論\n\n本文です。",
      tags: ["方位"],
      category: "暦とタイミング",
      publishedAt: "2026-11-15",
      updatedAt: "2026-11-15",
      readingMinutes: 3,
    };
    vi.doMock("@/lib/blogStore", () => ({
      loadBlogPageData: vi.fn(async (slug: string) =>
        slug === post.slug
          ? { post, related: [] }
          : { post: { ...post, slug }, related: [] },
      ),
    }));
    for (const name of [
      "@/components/blog/BlogArticleBody",
      "@/components/ads/AdBanner",
      "@/components/ads/AffiliateLink",
      "@/components/comments/DirectionComments",
    ]) {
      vi.doMock(name, () => ({
        BlogArticleBody: () => null,
        AdBanner: () => null,
        AffiliatePlacement: () => null,
        DirectionComments: () => null,
      }));
    }
    const { default: Page, generateMetadata } =
      await import("@/app/blog/[slug]/page");
    const render = async (slug: string) =>
      parse(
        renderToStaticMarkup(await Page({ params: Promise.resolve({ slug }) })),
      );
    const doc = await render("todays-lucky-direction-by-hour");
    const notice = doc.querySelector('[data-testid="primary-page-notice"]')!;
    expect(notice.querySelector("a")?.getAttribute("href")).toBe("/houi/today");
    expect(notice.textContent).toContain("今日の吉方位 時間別一覧");
    // 見出し・説明のあと、図や本文より前に出る。
    expect(
      doc.querySelector("h1")!.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "todays-lucky-direction-by-hour" }),
    });
    expect(metadata.alternates?.canonical).toBe(
      "/blog/todays-lucky-direction-by-hour",
    );
    expect(
      (await render("other-article")).querySelector(
        '[data-testid="primary-page-notice"]',
      ),
    ).toBeNull();
  });
});
