import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /calendar（引越しの日取りを選ぶ）でも、出した吉日を「残す・AI に渡す」
 * ことができる（利用者の依頼、2026-09-26「どちらも引越し時期を分析した
 * あと、それを保存できたらいい」）。全期間の分析と同じ部品・同じ文書。
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

const API = {
  honmeiStar: 7,
  voidZodiacs: ["辰", "巳"],
  summaries: [
    {
      direction: "SE",
      directionLabel: "南東",
      scannedDays: 365,
      tripleAuspiciousDays: 2,
      availableDays: 2,
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
          tags: [],
        },
      ],
    },
  ],
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  loadSettings.mockResolvedValue({ settings: {} });
  loadProfilePresets.mockResolvedValue({ presets: [] });
  writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("/calendar: 出した吉日を AI に渡す", () => {
  it("吉日を出したあと、方位ごとの三盤吉の日を文書にしてコピーできる", async () => {
    render(<AuspiciousDayFinder />);
    fireEvent.click(screen.getByRole("button", { name: /吉日を出す/ }));
    const copy = await screen.findByRole("button", {
      name: "AI に渡す用にコピー",
    });
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain("三盤すべてが吉になる日");
    expect(md).toContain("本命星: 七赤金星");
    expect(md).toContain("| 南東 | S 三盤吉 | 2026-10-12 | 1 |");
    /* 生年月日（既定の 2000-01-01）も座標も文書に入らない */
    expect(md).not.toContain("2000-01-01");
    expect(md).not.toContain("139.6917");
  });
});
