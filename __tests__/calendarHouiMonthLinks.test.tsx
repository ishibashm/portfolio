import { within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalendarMonthPage from "@/app/calendar/[month]/page";
import {
  houiMonthHref,
  monthContentYears,
  STAR_NAMES,
  STARS,
} from "@/lib/kigakuContent";

vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("houiMonthHref と /calendar/[month] の月別方位リンク", () => {
  it("monthContentYears に含まれる年は月別ページのパスを返す", () => {
    const year = monthContentYears()[0];
    for (const star of STARS) {
      expect(houiMonthHref(year, star, 1)).toBe(`/houi/${year}/${star}/1`);
      expect(houiMonthHref(year, star, 12)).toBe(`/houi/${year}/${star}/12`);
    }
  });

  it("2028年1〜4月（monthContentYears 外）は 404 になる月別リンクを返さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T12:00:00+09:00"));
    expect(monthContentYears()).not.toContain(2028);

    for (const month of [1, 2, 3, 4]) {
      for (const star of STARS) {
        expect(houiMonthHref(2028, star, month)).toBeNull();
      }
    }
  });

  it("monthContentYears 内の月のページは本命星ごとの月別ページへリンクする", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T12:00:00+09:00"));

    const page = await CalendarMonthPage({
      params: Promise.resolve({ month: "2027-04" }),
    });
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(page);
    const table = within(container).getAllByRole("table")[0];

    for (const star of STARS) {
      const link = within(table).getByRole("link", { name: STAR_NAMES[star] });
      expect(link).toHaveAttribute("href", `/houi/2027/${star}/4`);
    }
  });

  it.each(["2028-01", "2028-02", "2028-03", "2028-04"])(
    "/calendar/%s は存在しない /houi/2028/{star}/{month} へのリンクを出さない",
    async (slug) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-03T12:00:00+09:00"));

      const page = await CalendarMonthPage({
        params: Promise.resolve({ month: slug }),
      });
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(page);
      const table = within(container).getAllByRole("table")[0];

      expect(table.querySelectorAll("a")).toHaveLength(0);
      for (const star of STARS) {
        expect(table).toHaveTextContent(STAR_NAMES[star]);
      }
      expect(container.querySelector('a[href^="/houi/2028/"]')).toBeNull();
    },
  );
});
