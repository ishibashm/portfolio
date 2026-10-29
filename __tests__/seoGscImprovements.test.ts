import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMetadata as generateYearStarMetadata } from "@/app/houi/[year]/[star]/page";
import { metadata as fengShuiMetadata } from "@/app/houi/fengshui/page";
import { calendarMonths } from "@/lib/calendarMonths";

describe("Search Console 向けメタデータ", () => {
  it.each([
    [1, "一白水星"],
    [2, "二黒土星"],
    [3, "三碧木星"],
    [4, "四緑木星"],
    [5, "五黄土星"],
    [6, "六白金星"],
    [7, "七赤金星"],
    [8, "八白土星"],
    [9, "九紫火星"],
  ])(
    "2026年の星%i (%s) に月別の title と description を出す",
    async (star, name) => {
      const metadata = await generateYearStarMetadata({
        params: Promise.resolve({ year: "2026", star: String(star) }),
      });
      expect(metadata.title).toEqual({
        absolute: `2026年 ${name}の吉方位・凶方位【月別】 | Cloud Palette`,
      });
      const og = metadata.openGraph as { title?: string } | undefined;
      expect(og?.title?.match(/Cloud Palette/g) ?? []).toHaveLength(1);
      expect(metadata.description).toContain(
        `2026年 ${name}の吉方位と凶方位（五黄殺・暗剣殺）を月別に`,
      );
    },
  );

  it("八宅風水の自動計算を title と description の先頭に置く", () => {
    expect(fengShuiMetadata.title).toBe(
      "八宅風水 生年月日で自動計算・本命卦と吉方位を調べる",
    );
    // layout の title.template（"%s | Cloud Palette"）と混ぜないよう、全角の区切りを使わない
    expect(String(fengShuiMetadata.title)).not.toMatch(/[｜|]/);
    expect(String(fengShuiMetadata.title)).not.toContain("Cloud Palette");
    expect(fengShuiMetadata.description).toMatch(
      /^八宅風水を生年月日と性別から自動計算/,
    );
  });
});

describe("カレンダーの月別導線", () => {
  it("現在月から今後18か月を返す", () => {
    const months = calendarMonths(new Date("2026-10-26T12:00:00+09:00"));
    expect(months).toHaveLength(18);
    expect(months[0]).toEqual({ year: 2026, month: 10 });
    expect(months[17]).toEqual({ year: 2028, month: 3 });
  });

  it("calendar トップが月別一覧を描画し、ホームに導線がある", () => {
    const calendarPage = readFileSync(
      join(process.cwd(), "src/app/calendar/page.tsx"),
      "utf8",
    );
    const homePortal = readFileSync(
      join(process.cwd(), "src/components/home/HomePortal.tsx"),
      "utf8",
    );
    expect(calendarPage).toContain("calendarMonths().map");
    expect(calendarPage).toContain(
      "href={`/calendar/${calendarMonthSlug(c)}`}",
    );
    expect(homePortal).toContain('href="/calendar"');
  });
});
