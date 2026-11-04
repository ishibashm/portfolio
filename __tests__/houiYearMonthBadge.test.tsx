import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/houi/[year]/[star]/page";
import {
  contentYears,
  getMonthDirections,
  getYearDirections,
} from "@/lib/kigakuContent";
vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));
vi.mock("@/components/practitioners/PractitionerStrip", () => ({
  PractitionerStrip: () => null,
}));
vi.mock("@/components/motion/CompassDial", () => ({ CompassDial: () => null }));
it("renders badges only for the same direction good in both boards, including January's previous year", async () => {
  const year = contentYears()[0];
  for (const star of [1, 3, 7]) {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ year: String(year), star: String(star) }),
      }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const list = [...doc.querySelectorAll("section")].find(
      (s) => s.querySelector("h2")?.textContent === "月ごとの吉方位",
    )!;
    const months = list.querySelectorAll("ul > li");
    expect(months).toHaveLength(12);
    months.forEach((item, i) => {
      const annual = getYearDirections(
        i === 0 ? year - 1 : year,
        star,
        "classical",
      ).verdicts;
      const both = getMonthDirections(
        year,
        i + 1,
        star,
        "classical",
      ).verdicts.filter(
        (m) =>
          m.kind === "good" &&
          annual.some((a) => a.kind === "good" && a.direction === m.direction),
      );
      if (both.length) {
        expect(item.textContent).toContain(
          `年月とも吉：${both.map((v) => v.jp).join("・")}`,
        );
        expect(item.className).toContain("bg-emerald-50");
      } else expect(item.textContent).not.toContain("年月とも吉");
    });
  }
});
