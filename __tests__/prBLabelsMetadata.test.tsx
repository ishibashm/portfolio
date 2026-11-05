import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { generateMetadata as yearMetadata } from "@/app/houi/[year]/[star]/page";
import { generateMetadata as monthMetadata } from "@/app/houi/[year]/[star]/[month]/page";
import { metadata as areaMetadata } from "@/app/houi/area/page";
import { metadata as todayMetadata } from "@/app/houi/today/page";
import { metadata as dashboardMetadata } from "@/app/relocation/dashboard/layout";
import BlogPage, { generateMetadata as blogMetadata } from "@/app/blog/page";
vi.mock("@/lib/blogStore", () => ({ loadBlogPosts: vi.fn(async () => []) }));
afterEach(() => vi.useRealTimers());

describe("PR-B: 検索意図を先頭に置くメタデータ", () => {
  it.each([2026, 2027])(
    "%i年の年別ページは同じ形式で星と月別の内容を伝える",
    async (year) => {
      for (const [star, name] of [
        [1, "一白水星"],
        [4, "四緑木星"],
        [5, "五黄土星"],
      ] as const) {
        const metadata = await yearMetadata({
          params: Promise.resolve({ year: String(year), star: String(star) }),
        });
        const title = `${year}年 ${name}の吉方位・凶方位｜引越しの方位を月別に確認`;
        expect(metadata.title).toEqual({ absolute: title });
        expect(metadata.description!.length).toBeGreaterThanOrEqual(80);
        expect(metadata.description!.length).toBeLessThanOrEqual(110);
        expect(metadata.openGraph).toMatchObject({
          title: `${title} | Cloud Palette`,
          description: metadata.description,
        });
        expect(metadata.robots).toBeUndefined();
      }
    },
  );
  it.each([2026, 2027])(
    "%i年の全月は年・月・星・分かる内容を共通の形式で伝える",
    async (year) => {
      for (let month = 1; month <= 12; month++) {
        const metadata = await monthMetadata({
          params: Promise.resolve({
            year: String(year),
            star: "4",
            month: String(month),
          }),
        });
        expect(metadata.title).toBe(
          `${year}年${month}月 四緑木星の吉方位・凶方位｜月盤と節入りを確認`,
        );
        expect(metadata.description).toContain("節入りで切り替わる対象期間");
        expect(metadata.openGraph).toMatchObject({
          title: `${metadata.title} | Cloud Palette`,
          description: metadata.description,
        });
      }
    },
  );
  it("地域名・方位と今日の吉方位を先頭に置く", () => {
    expect(areaMetadata.title).toBe(
      "地域名から方位と家賃相場を調べる｜市区町村別の引越し先を比較",
    );
    expect(areaMetadata.openGraph).toMatchObject({
      title: `${areaMetadata.title} | Cloud Palette`,
      description: areaMetadata.description,
    });
    expect(todayMetadata.title).toMatch(/^今日の吉方位と時間/);
    expect(todayMetadata.openGraph).toMatchObject({
      title: `${todayMetadata.title} | Cloud Palette`,
    });
    expect(dashboardMetadata.title).toBe(
      "今日の吉方位と時間帯を生年月日で確認｜目的地の方位と真太陽時",
    );
    expect(dashboardMetadata.openGraph).toMatchObject({
      title: `${dashboardMetadata.title} | Cloud Palette`,
    });
  });
  it.each([2026, 2027])(
    "ブログのtitle・OG・見出しにテーマと日本時間の%i年を出す",
    async (year) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${year - 1}-12-31T15:00:00Z`));
      const title = `九星気学・方位・天中殺の記事一覧（${year}年）`;
      const metadata = blogMetadata();
      expect(metadata.title).toBe(title);
      expect(metadata.openGraph).toMatchObject({
        title: `${title} | Cloud Palette`,
      });
      expect(metadata.robots).toBeUndefined();
      const html = renderToStaticMarkup(await BlogPage());
      expect(html).toMatch(
        new RegExp(`<h1[^>]*>${title.replace(/[（）]/g, "\\$&")}</h1>`),
      );
    },
  );
});

describe("カレンダーの個人天中殺ラベル", () => {
  it("凡例・集計・セル・詳細・助言で宿命の空亡と明示する", () => {
    const source = readFileSync(
      "src/components/widgets/CosmicCalendar.tsx",
      "utf8",
    );
    expect(source.match(/label: "あなたの天中殺（宿命の空亡）"/g)).toHaveLength(
      2,
    );
    expect(source).toContain('title="あなたの天中殺（宿命の空亡）"');
    expect(source).toContain(
      "<p>あなたの天中殺（宿命の空亡）に当たる日です。</p>",
    );
    expect(source).toMatch(/あなたの天中殺（宿命の空亡）:\s*<\/span>/);
    expect(source).toContain(
      "本日はあなたの天中殺（宿命の空亡）に当たる日です",
    );
    expect(source).not.toMatch(/天中殺（空亡）|天中殺 \(Void/);
  });
});
