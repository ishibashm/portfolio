import React from "react";
import { render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollReset } from "@/components/home/ScrollReset";
import YearPage from "@/app/houi/[year]/[star]/page";
import {
  getMonthDirections,
  contentYears,
  monthContentYears,
  STARS,
} from "@/lib/kigakuContent";

vi.mock("@/components/practitioners/PractitionerStrip", () => ({
  PractitionerStrip: () => null,
}));
vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));
vi.mock("@/components/motion/CompassDial", () => ({ CompassDial: () => null }));

afterEach(() => vi.restoreAllMocks());

describe("トップページのスクロール制御", () => {
  it("マウント時に先頭へ戻し、離脱時はブラウザの復元設定を戻す", () => {
    window.history.scrollRestoration = "auto";
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { container, unmount } = render(<ScrollReset />);
    expect(container).toBeEmptyDOMElement();
    expect(scroll).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
    expect(window.history.scrollRestoration).toBe("manual");
    unmount();
    expect(window.history.scrollRestoration).toBe("auto");
  });
});

describe("年別ページの月別サマリー", () => {
  it("月別詳細ページがない年もサマリーを表示し、存在しない詳細リンクは出さない", async () => {
    const year = contentYears().find((y) => !monthContentYears().includes(y))!;
    const page = await YearPage({
      params: Promise.resolve({ year: String(year), star: "1" }),
    });
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(page);
    const section = within(container)
      .getByRole("heading", { name: "月ごとの吉方位" })
      .closest("section")!;
    expect(within(section).getAllByRole("listitem")).toHaveLength(12);
    expect(section.querySelector("details")).toBeNull();
    expect(section.querySelector("a")).toBeNull();
  });

  it.each(STARS)(
    "本命星%sの12か月を既存の月盤判定どおり常時表示する",
    async (star) => {
      const year = monthContentYears()[0];
      const page = await YearPage({
        params: Promise.resolve({ year: String(year), star: String(star) }),
      });
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(page);
      const section = within(container)
        .getByRole("heading", { name: "月ごとの吉方位" })
        .closest("section")!;
      const cards = within(section).getAllByRole("listitem");
      expect(cards).toHaveLength(12);
      for (const [index, card] of cards.entries()) {
        expect(card.closest("details")).toBeNull();
        const { verdicts } = getMonthDirections(
          year,
          index + 1,
          star,
          "classical",
        );
        for (const verdict of verdicts.filter((v) => v.kind === "bad")) {
          expect(card).toHaveTextContent(`${verdict.jp}（${verdict.label}）`);
        }
        const good = verdicts.filter((v) => v.kind === "good");
        expect(card).toHaveTextContent(
          `吉：${good.length ? good.map((v) => v.jp).join("・") : "なし"}`,
        );
      }
      const details = container.querySelectorAll("details");
      const comparison = details[details.length - 1];
      expect(comparison).not.toHaveAttribute("open");
      expect(comparison.querySelector("summary")).toHaveTextContent(
        "算出方法による違い（古典 vs 物理モデル）",
      );
      expect(
        comparison.compareDocumentPosition(
          within(container).getByRole("heading", { name: "ほかの年" }),
        ) & Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    },
  );
});
