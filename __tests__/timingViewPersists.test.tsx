import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TIMING_SCAN_KEY,
  TIMING_VIEW_KEY,
  readTimingScan,
  readTimingView,
  writeTimingScan,
  writeTimingView,
} from "@/lib/timingViewState";
import { allCategories } from "@/lib/timingFilter";

/**
 * 引っ越し時期の全期間分析で、**頁を離れて戻っても設定し直さずに済む**こと
 * （利用者の指摘、2026-09-24）。
 *
 *     全期間分析をフィルタリングして、その後またページに戻ると
 *     フィルタリングが消えてまた始めから設定し直す
 *
 * 範囲・方位・段階の絞り込み・吉日だけは画面の state にしか無く、頁を離れる
 * と消えていた。走査はボタンで始める作り（#80）なので、結果も消えて押し
 * 直しになっていた。
 *
 *   見え方 … localStorage（数か月後に開いても同じ見方で始まってよい）
 *   走査   … localStorage。**今日を起点にした**結果なので日が変われば捨てる
 */

vi.mock("recharts", () => {
  const Nothing = () => null;
  return {
    Bar: Nothing,
    BarChart: Nothing,
    CartesianGrid: Nothing,
    Legend: Nothing,
    ResponsiveContainer: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});
vi.mock("@/components/ArbitrageMap", () => ({ ArbitrageMap: () => null }));

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock("@/lib/userSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));

import TimingAnalyticsPage from "@/app/relocation/timing/page";

describe("lib: 見え方を読む・書く", () => {
  beforeEach(() => localStorage.clear());

  it("何も無ければ既定（過去 6・未来 18・全段階・吉日だけでない）", () => {
    const v = readTimingView(localStorage);
    expect(v.pastMonths).toBe(6);
    expect(v.futureMonths).toBe(18);
    expect(v.focusDir).toBeNull();
    expect([...v.tierFilter].sort()).toEqual([...allCategories()].sort());
    expect(v.luckyOnly).toBe(false);
  });

  it("書いたものがそのまま戻る", () => {
    writeTimingView(localStorage, {
      pastMonths: 12,
      futureMonths: 24,
      focusDir: "SE",
      tierFilter: new Set(["S", "A"]),
      luckyOnly: true,
    });
    const v = readTimingView(localStorage);
    expect(v.pastMonths).toBe(12);
    expect(v.futureMonths).toBe(24);
    expect(v.focusDir).toBe("SE");
    expect([...v.tierFilter].sort()).toEqual(["A", "S"]);
    expect(v.luckyOnly).toBe(true);
  });

  it("知らない値・壊れた保存は捨てて既定に戻す", () => {
    localStorage.setItem(
      TIMING_VIEW_KEY,
      JSON.stringify({
        pastMonths: 7,
        futureMonths: "18",
        focusDir: "XX",
        tierFilter: ["Z"],
        luckyOnly: "yes",
      }),
    );
    const v = readTimingView(localStorage);
    expect(v.pastMonths).toBe(6);
    expect(v.futureMonths).toBe(18);
    expect(v.focusDir).toBeNull();
    /* 1 つも残らなければ全段階（何も出ない絞り込みで始めない） */
    expect(v.tierFilter.size).toBe(allCategories().size);
    expect(v.luckyOnly).toBe(false);

    localStorage.setItem(TIMING_VIEW_KEY, "{not json");
    expect(readTimingView(localStorage).pastMonths).toBe(6);
  });
});

describe("lib: 走査の結果は今日のぶんだけ使う", () => {
  beforeEach(() => localStorage.clear());

  const CACHE = {
    key: "k",
    party: "",
    day: "2026-09-24",
    days: [{ date: "2026-09-24" }],
    members: [],
    profile: { honmeiStar: 7, voidZodiacs: ["辰", "巳"] },
    pastClippedDays: null,
  };

  it("同じ日なら戻る", () => {
    writeTimingScan(localStorage, CACHE);
    const got = readTimingScan(localStorage, "2026-09-24");
    expect(got?.key).toBe("k");
    expect(got?.days).toHaveLength(1);
    expect(got?.profile?.voidZodiacs).toEqual(["辰", "巳"]);
  });

  it("日が変わっていたら使わずに消す（今日を起点にした結果なので）", () => {
    writeTimingScan(localStorage, CACHE);
    expect(readTimingScan(localStorage, "2026-09-25")).toBeNull();
    expect(localStorage.getItem(TIMING_SCAN_KEY)).toBeNull();
  });

  it("生年月日から出た結果なので「すべて消す」の対象に入っている", async () => {
    const { ACCOUNT_LOCAL_KEYS } = await import("@/lib/accountData");
    expect(ACCOUNT_LOCAL_KEYS).toContain(TIMING_SCAN_KEY);
    expect(ACCOUNT_LOCAL_KEYS).not.toContain(TIMING_VIEW_KEY);
  });

  it("形が壊れていたら使わない", () => {
    localStorage.setItem(
      TIMING_SCAN_KEY,
      JSON.stringify({ ...CACHE, days: "x" }),
    );
    expect(readTimingScan(localStorage, "2026-09-24")).toBeNull();
  });
});

/* ── 画面: 離れて戻る ─────────────────────────────── */

function setupDevice() {
  /* 京都市役所あたり（公開の代表点）。利用者の登録内容ではない */
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({
      birth_date: "1966-09-22T12:00",
      base_lat: 35.0116,
      base_lon: 135.7681,
    }),
  );
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TimingAnalyticsPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  const buttons = () => [...container.querySelectorAll("button")];
  return {
    text: () => container.textContent ?? "",
    pastSelect: () =>
      [...container.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.textContent === "0か月"),
      ) as HTMLSelectElement,
    scanButton: () =>
      buttons().find((b) =>
        /走査を始める|この範囲で走査$/.test(b.textContent ?? ""),
      ) as HTMLButtonElement,
    change: async (el: HTMLSelectElement, value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value",
        )!.set!;
        setter.call(el, value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    click: async (el: HTMLElement) => {
      await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 10));
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("画面: 頁を離れて戻っても、見え方と走査が残る", () => {
  let scans: number;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    localStorage.clear();
    setupDevice();
    loadSettings.mockResolvedValue({ settings: {}, synced: false });
    scans = 0;
    const today = localIso(new Date());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/relocation/auspicious-days")) {
          scans++;
          return {
            ok: true,
            json: async () => ({
              days: [
                {
                  date: today,
                  weekday: new Date().getDay(),
                  rokuyo: "大安",
                  tags: [],
                  blocked: false,
                  tiers: {
                    N: "S",
                    NE: "A",
                    E: "B",
                    SE: "C",
                    S: "D",
                    SW: "X",
                    W: "C",
                    NW: "B",
                  },
                },
              ],
              members: [],
              honmeiStar: 7,
              voidZodiacs: [],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }) as never,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("走査の範囲（過去 12 か月）が戻る", async () => {
    const first = await mount();
    await first.change(first.pastSelect(), "12");
    expect(first.pastSelect().value).toBe("12");
    await first.unmount();

    const again = await mount();
    expect(again.pastSelect().value).toBe("12");
    await again.unmount();
  });

  it("走査の結果が戻り、押し直さなくてよい", async () => {
    const first = await mount();
    await first.click(first.scanButton());
    expect(scans).toBe(1);
    await first.unmount();

    const again = await mount();
    /* 走らせていない（開いただけで走らせない決めは #80 のまま） */
    expect(scans).toBe(1);
    /* 結果がある画面のボタン（押し直し用）が出ている */
    expect(again.scanButton().textContent).toMatch(/この範囲で走査$/);
    expect(again.text()).not.toContain("走査を始める");
    await again.unmount();
  });
});
