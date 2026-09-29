import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAVORITE_DAYS_KEY,
  FAVORITE_DAYS_LIMIT,
  parseFavoriteDays,
  toggleFavoriteDay,
  type FavoriteDay,
} from "@/lib/favoriteDays";
import { ACCOUNT_LOCAL_KEYS } from "@/lib/accountData";

/**
 * 日取りのお気に入り（利用者の依頼、2026-09-29「日取りもお気に入り
 * できるようにしてほしい」）。
 *
 * - 1 件は「日付 × 方位」。同じ日でも方位が違えば別のお気に入り
 * - 置き場は端末の localStorage だけ。**生年月日と座標は入れない**
 * - 「登録した内容をすべて消す」の対象に入っている
 * - /calendar の表の ☆ で足し外しでき、下の一覧にすぐ出る
 */

const { loadSettings, loadProfilePresets } = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  loadProfilePresets: vi.fn(),
}));
vi.mock("@/lib/userSettings", async (orig) => ({
  ...(await orig<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));
vi.mock("@/lib/profilePresetSync", async (orig) => ({
  ...(await orig<typeof import("@/lib/profilePresetSync")>()),
  loadProfilePresets,
}));

import { AuspiciousDayFinder } from "@/components/relocation/AuspiciousDayFinder";
import { FavoriteDaysPanel } from "@/components/relocation/FavoriteDaysPanel";

const day = (date: string, direction = "SE"): Omit<FavoriteDay, "savedAt"> => ({
  date,
  direction,
  directionLabel: direction === "SE" ? "南東" : "北",
  yearLabel: "三盤吉",
  monthLabel: "三盤吉",
  dayLabel: "三盤吉",
  tags: ["天赦日"],
  blockedByTenchusatsu: false,
});

const API = {
  honmeiStar: 7,
  voidZodiacs: ["辰", "巳"],
  summaries: [
    {
      direction: "SE",
      directionLabel: "南東",
      scannedDays: 365,
      tripleAuspiciousDays: 1,
      availableDays: 1,
      blockedByTenchusatsuDays: 0,
      window: { yearBoardValidUntil: null, afterYearBoardStatus: null },
      days: [
        {
          date: "2026-10-12",
          weekday: 1,
          yearLayer: "OPTIMAL",
          monthLayer: "OPTIMAL",
          dayLayer: "OPTIMAL",
          blockedByTenchusatsu: false,
          voidScopes: { year: false, month: false, day: false },
          tags: ["一粒万倍日"],
        },
      ],
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  loadSettings.mockResolvedValue({ settings: {} });
  loadProfilePresets.mockResolvedValue({ presets: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/relocation/auspicious-days")
        ? new Response(JSON.stringify(API), { status: 200 })
        : new Response("{}", { status: 404 }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("置き場（lib/favoriteDays）", () => {
  it("同じ日・同じ方位はもう一度押すと外れ、方位が違えば別に持つ", () => {
    toggleFavoriteDay(day("2026-10-12", "SE"));
    toggleFavoriteDay(day("2026-10-12", "N"));
    expect(
      parseFavoriteDays(localStorage.getItem(FAVORITE_DAYS_KEY)),
    ).toHaveLength(2);
    toggleFavoriteDay(day("2026-10-12", "SE"));
    const left = parseFavoriteDays(localStorage.getItem(FAVORITE_DAYS_KEY));
    expect(left.map((f) => f.direction)).toEqual(["N"]);
  });

  it("日付の順に並び、壊れた行は捨てる", () => {
    localStorage.setItem(
      FAVORITE_DAYS_KEY,
      JSON.stringify([
        { ...day("2026-12-01"), savedAt: "2026-09-29T00:00:00.000Z" },
        { date: "明日", direction: "N" },
        { ...day("2026-10-01"), savedAt: "2026-09-29T00:00:00.000Z" },
      ]),
    );
    expect(
      parseFavoriteDays(localStorage.getItem(FAVORITE_DAYS_KEY)).map(
        (f) => f.date,
      ),
    ).toEqual(["2026-10-01", "2026-12-01"]);
    expect(parseFavoriteDays("{壊れた")).toEqual([]);
  });

  it(`上限（${FAVORITE_DAYS_LIMIT} 件）を超えたら、古く保存したものから落とす`, () => {
    for (let i = 0; i <= FAVORITE_DAYS_LIMIT; i++) {
      const d = new Date(Date.UTC(2027, 0, 1 + i));
      toggleFavoriteDay(
        day(d.toISOString().slice(0, 10)),
        new Date(Date.UTC(2026, 8, 1, 0, i)),
      );
    }
    const kept = parseFavoriteDays(localStorage.getItem(FAVORITE_DAYS_KEY));
    expect(kept).toHaveLength(FAVORITE_DAYS_LIMIT);
    expect(kept.some((f) => f.date === "2027-01-01")).toBe(false);
  });

  it("生年月日と座標は入れない", () => {
    toggleFavoriteDay(day("2026-10-12"));
    const raw = localStorage.getItem(FAVORITE_DAYS_KEY) ?? "";
    expect(raw).not.toMatch(/birth|lat|lon/i);
  });

  it("「登録した内容をすべて消す」の対象に入っている", () => {
    expect(ACCOUNT_LOCAL_KEYS).toContain(FAVORITE_DAYS_KEY);
  });
});

describe("/calendar の ☆ と一覧", () => {
  it("表の ☆ で足すと下の一覧に出て、もう一度押すと消える", async () => {
    render(
      <>
        <AuspiciousDayFinder />
        <FavoriteDaysPanel />
      </>,
    );
    expect(screen.getByText(/☆ を押すと、ここに残ります/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /吉日を出す/ }));
    const star = await screen.findByRole("button", {
      name: "2026-10-12 南東 をお気に入りに追加",
    });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(star);

    expect(
      within(screen.getByRole("table"))
        .getByRole("button", { name: "2026-10-12 南東 をお気に入りから外す" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const heading = screen.getByRole("heading", { name: /お気に入りの日取り/ });
    const panel = heading.closest("section")!;
    expect(panel.textContent).toContain("2026-10-12");
    expect(panel.textContent).toContain("（月）");
    expect(panel.textContent).toContain("南東");
    expect(panel.textContent).toContain("一粒万倍日");

    fireEvent.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: "2026-10-12 南東 をお気に入りから外す",
      }),
    );
    expect(screen.getByText(/☆ を押すと、ここに残ります/)).toBeTruthy();
  });

  it("一覧の × でも外せる", () => {
    toggleFavoriteDay(day("2026-10-12"));
    render(<FavoriteDaysPanel />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "2026-10-12 南東 をお気に入りから外す",
      }),
    );
    expect(localStorage.getItem(FAVORITE_DAYS_KEY)).toBe("[]");
  });
});
