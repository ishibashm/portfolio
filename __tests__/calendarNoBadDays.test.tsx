import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /calendar の日取りの表は、三盤吉だけでなく凶の無い日も出す
 * （利用者の指摘、2026-09-29「三盤吉の方角しか出ないけど、凶がないなら
 * 他の方角も出したらどう？」）。
 *
 * - API は scope=noBad で呼ぶ（既定の三盤吉だけは MCP などのために残す）
 * - 三盤吉が 0 日でも、凶の無い日がある方位は出る（以前は方位ごと消えた）
 * - 行ごとに段階の札（S 三盤吉 / A 吉2盤・凶なし …）を出す
 * - 「三盤吉（S）だけ」で従来の見え方に戻せる
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

const day = (date: string, tier: string, layers: [string, string, string]) => ({
  date,
  weekday: 1,
  yearLayer: layers[0],
  monthLayer: layers[1],
  dayLayer: layers[2],
  blockedByTenchusatsu: false,
  voidScopes: { year: false, month: false, day: false },
  tags: [],
  tier,
});
const summary = (
  direction: string,
  directionLabel: string,
  days: ReturnType<typeof day>[],
) => {
  const triple = days.filter((d) => d.tier === "S").length;
  return {
    direction,
    directionLabel,
    scannedDays: 365,
    tripleAuspiciousDays: triple,
    availableDays: triple,
    blockedByTenchusatsuDays: 0,
    noBadDays: days.length,
    availableNoBadDays: days.length,
    window: { yearBoardValidUntil: null, afterYearBoardStatus: null },
    days,
  };
};

const API = {
  honmeiStar: 7,
  voidZodiacs: ["辰", "巳"],
  summaries: [
    summary("NW", "北西", [
      day("2026-10-04", "S", ["OPTIMAL", "OPTIMAL", "OPTIMAL"]),
      day("2026-10-06", "B", ["OPTIMAL", "SAFE", "SAFE"]),
    ]),
    // 三盤吉は 0 日だが、凶の無い日はある方位
    summary("E", "東", [
      day("2026-10-09", "A", ["OPTIMAL", "OPTIMAL", "SAFE"]),
    ]),
    summary("S", "南", []),
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  loadSettings.mockResolvedValue({ settings: {} });
  loadProfilePresets.mockResolvedValue({ presets: [] });
  fetchMock = vi.fn(async (url: string) =>
    String(url).startsWith("/api/relocation/auspicious-days")
      ? new Response(JSON.stringify(API), { status: 200 })
      : new Response("{}", { status: 404 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 方位の札（見出しの方位名から、その方位の札の器を引く） */
function headings(): string[] {
  return [...document.querySelectorAll("span.text-base.font-bold")].map(
    (e) => e.textContent ?? "",
  );
}
function card(label: string): HTMLElement {
  const h = [...document.querySelectorAll("span.text-base.font-bold")].find(
    (e) => e.textContent === label,
  );
  return h!.closest("div.rounded-2xl") as HTMLElement;
}

async function run() {
  render(<AuspiciousDayFinder />);
  fireEvent.click(screen.getByRole("button", { name: /吉日を出す/ }));
  await screen.findByText("2026-10-04");
}

describe("/calendar: 凶の無い日も出す", () => {
  it("API を scope=noBad で呼ぶ", async () => {
    await run();
    const url = String(
      fetchMock.mock.calls.find(([u]) =>
        String(u).startsWith("/api/relocation/auspicious-days"),
      )![0],
    );
    expect(new URL(url, "https://x").searchParams.get("scope")).toBe("noBad");
  });

  it("三盤吉 0 日の方位も出て、行ごとに段階の札が付く", async () => {
    await run();
    expect(headings()).toEqual(["北西", "東"]);
    expect(screen.getByText("A 吉2盤・凶なし")).toBeTruthy();
    expect(screen.getByText("S 三盤吉")).toBeTruthy();
    expect(screen.getByText("B 吉1盤・凶なし")).toBeTruthy();
    // 凶の無い日が 1 日も無い方位（南）は出さない
  });

  it("見出しに三盤吉の数と凶なしの数を分けて出す", async () => {
    await run();
    const nw = card("北西");
    expect(nw.textContent).toMatch(/三盤吉\s*1\s*日/);
    expect(nw.textContent).toMatch(/凶なし（吉2盤・吉1盤・平を含む）\s*2\s*日/);
  });

  it("「三盤吉（S）だけ」で S 以外の行が消える", async () => {
    await run();
    fireEvent.click(screen.getByLabelText("三盤吉（S）だけ"));
    expect(screen.queryByText("2026-10-06")).toBeNull();
    expect(screen.queryByText("2026-10-09")).toBeNull();
    expect(screen.getByText("2026-10-04")).toBeTruthy();
    const east = card("東");
    expect(
      within(east).getByText(/この絞り込みに当てはまる日がありません/),
    ).toBeTruthy();
  });
});
