import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/houi/[year]/page";
import { generateStaticParams as starParams } from "@/app/houi/[year]/[star]/page";
import {
  contentYears,
  getYearDirections,
  monthContentYears,
  MONTHS,
  STARS,
  STAR_NAMES,
} from "@/lib/kigakuContent";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const paramsFor = (year: string | number) => ({
  params: Promise.resolve({ year: String(year) }),
});

describe("方位の年ページ", () => {
  it("公開対象年を静的生成し、未知のパラメータもページで検証する", () => {
    expect(dynamicParams).toBe(true);
    expect(generateStaticParams()).toEqual(
      contentYears().map((year) => ({ year: String(year) })),
    );
  });

  it("範囲外・非数値・数値に続く文字を404にする", async () => {
    const years = contentYears();
    for (const year of [
      years[0] - 1,
      years.at(-1)! + 1,
      "abc",
      `${years[0]}abc`,
      `${years[0]}.5`,
      "",
    ]) {
      await expect(Page(paramsFor(year))).rejects.toThrow("NEXT_NOT_FOUND");
      expect(await generateMetadata(paramsFor(year))).toEqual({});
    }
  });

  for (const year of contentYears()) {
    it(`${year}年の要約とリンクは公開対象と一致する`, async () => {
      const html = renderToStaticMarkup(await Page(paramsFor(year)));
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.body.textContent).toContain(
        `中宮が${STAR_NAMES[getYearDirections(year, 1, "classical").centerStar]}`,
      );
      const cards = doc.querySelectorAll("section ul > li");
      expect(cards).toHaveLength(9);
      const existingStars = new Set(
        starParams().map((p) => `/houi/${p.year}/${p.star}`),
      );
      cards.forEach((card, index) => {
        const star = STARS[index];
        const link = card.querySelector("h3 a")!;
        expect(link.getAttribute("href")).toBe(`/houi/${year}/${star}`);
        expect(existingStars.has(link.getAttribute("href")!)).toBe(true);
        const { verdicts } = getYearDirections(year, star, "classical");
        const good = verdicts.filter((v) => v.kind === "good");
        expect(card.querySelector(".text-emerald-900")?.textContent).toBe(
          `吉方位：${good.length ? good.map((v) => v.jp).join("・") : "なし"}`,
        );
        expect(card.querySelector(".text-rose-900")?.textContent).toBe(
          `凶方位：${
            verdicts
              .filter((v) => v.kind === "bad")
              .map((v) => `${v.jp}（${v.label}）`)
              .join("、") || "なし"
          }`,
        );
      });
      const monthLinks = [...doc.querySelectorAll("details a")];
      expect(monthLinks).toHaveLength(
        monthContentYears().includes(year) ? 108 : 0,
      );
      for (const link of monthLinks) {
        const [, , y, s, m] = link.getAttribute("href")!.split("/");
        expect(monthContentYears()).toContain(Number(y));
        expect(STARS).toContain(Number(s));
        expect(MONTHS).toContain(Number(m));
      }
      const adjacentLinks = [
        ...doc.querySelectorAll('nav[aria-label="前後の年"] a'),
      ];
      expect(adjacentLinks.map((a) => a.getAttribute("href"))).toEqual([
        ...[year - 1, year + 1]
          .filter((y) => contentYears().includes(y))
          .map((y) => `/houi/${y}`),
        "/houi",
      ]);
      expect(doc.body.textContent).toContain("このページの位置づけ");
      expect(doc.body.textContent).toContain("この一覧の使い方");
      const usageHrefs = [...doc.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
      for (const href of [
        "/guide/honmei",
        "/calendar",
        "/houi/tenchusatsu",
        "/houi/area",
        "/houi/pref",
        "/about",
      ]) {
        expect(usageHrefs, href).toContain(href);
      }
      const metadata = await generateMetadata(paramsFor(year));
      expect(metadata.alternates?.canonical).toBe(`/houi/${year}`);
      expect(metadata.openGraph?.url).toContain(`/houi/${year}`);
      expect(metadata.description).toContain(`${year}年`);
    });
  }
});
