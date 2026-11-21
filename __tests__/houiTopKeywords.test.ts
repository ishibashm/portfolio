import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/houi/page";
import { SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/siteStructure";

describe("トップと /houi の検索キーワードの役割", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("トップは引越しと家賃比較を案内する", () => {
    expect(SITE_TAGLINE).toContain("引越し");
    expect(SITE_TAGLINE).toContain("家賃");
    expect(SITE_DESCRIPTION).toContain("家賃");
    for (const keyword of ["本命星", "吉方位"]) {
      expect(SITE_TAGLINE).not.toContain(keyword);
      expect(SITE_DESCRIPTION).not.toContain(keyword);
    }
    expect(SITE_DESCRIPTION).not.toContain("賃貸物件のデータ");
  });

  it.each([2026, 2031])("/houi は %i 年の引越し方位を案内する", (year) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${year}-06-01T00:00:00+09:00`));
    const metadata = generateMetadata();
    expect(metadata.title).toBe(
      `本命星と吉方位の調べ方｜${year}年の引越し方位早見表`,
    );
    // title と description の年次更新を確認する。
    expect(metadata.description).toBe(
      `生まれ年から本命星を調べ、${year}年の吉方位と避けたい方位を早見表で確認できます。年盤の五黄殺・暗剣殺・歳破・本命殺と月別の方位を比較し、引越しの時期を検討できます。方位の吉凶は占い上の目安です。`,
    );
    expect(metadata.title).not.toBe(SITE_TAGLINE);
  });
});
