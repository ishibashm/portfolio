import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 時期ツールの走査は、**押したときだけ始まり、押した時点の設定で走る**こと。
 *
 * ## 押したときだけ始まる（利用者の依頼、2026-09-21）
 *
 * 以前は設定が読めた時点で自動で走り、設定が変わるたびに走り直していた。
 * 2 年ぶん・同行者ぶんを毎回数えるので、開いただけで待たされる。
 *
 * ## 押した時点の設定で走る（利用者報告 2026-09-19 の回帰）
 *
 * select は「本命星＋環境方位」なのに、同行者の欄には「私（東）が 506 日
 * 『天中殺』」と出ていた。走査は composite のままで、select だけが切り
 * 替わっていた。原因は 2 つあり、
 *
 *   1. 最初の描画が判定の設定を既定値（composite）固定で持っていて、
 *      端末に保存してある本命星＋環境方位を読んでいなかった
 *   2. 最初の走査が返る前にクラウドの設定が届いても走査し直さなかった
 *
 * 2 は「押したときだけ走る」ので起きなくなった（押した時点の設定で走る）。
 * **1 はいまも生きている**——端末の設定を読めていなければ、押した瞬間に
 * 既定値で走ってしまう。ここで見張るのはそちら。
 *
 * fetch に渡した directionFilterMode を見る。走査の中身は API の側の
 * 見張り（directionFilterLayers ほか）が持つ。
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

const SCAN_URL = "/api/relocation/auspicious-days";

/** 走査の fetch に渡した判定モードを、呼ばれた順に返す。 */
function scannedModes(calls: string[]): (string | null)[] {
  return calls
    .filter((u) => u.startsWith(SCAN_URL))
    .map((u) => new URL(u, "http://x").searchParams.get("directionFilterMode"));
}

/** 登録済みの端末。出発地・生年月日がそろっているので走らせられる。 */
function setupDevice(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({
      birth_date: "1966-09-22T12:00",
      base_lat: 35.0116,
      base_lon: 135.7681,
      ...extra,
    }),
  );
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TimingAnalyticsPage />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  const buttons = () => [...container.querySelectorAll("button")];
  return {
    container,
    text: () => container.textContent ?? "",
    unmount: async () => {
      await act(async () => root.unmount());
    },
    modeSelect: () =>
      [...container.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "composite"),
      ) as HTMLSelectElement,
    /** 走査の引き金。走らせる前は「走査を始める」、あとは「この範囲で走査」 */
    scanButton: () =>
      buttons().find((b) =>
        /走査を始める|この範囲で走査$/.test(b.textContent ?? ""),
      ) as HTMLButtonElement,
    click: async (el: HTMLElement) => {
      await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 10));
      });
    },
  };
}

const EMPTY_SCAN = {
  ok: true,
  json: async () => ({ days: [], members: [], honmeiStar: 7, voidZodiacs: [] }),
};

function stubFetch(calls: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return EMPTY_SCAN;
    }) as never,
  );
}

describe("走査はボタンで始まる", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("開いただけでは走らせない", async () => {
    setupDevice();
    const calls: string[] = [];
    stubFetch(calls);
    loadSettings.mockResolvedValue({ settings: {}, synced: false });

    const page = await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(scannedModes(calls)).toEqual([]);
    /* 代わりに、押せることが画面に出ている */
    expect(page.text()).toContain("走査を始める");
    await page.unmount();
  });

  it("押すと走る", async () => {
    setupDevice();
    const calls: string[] = [];
    stubFetch(calls);
    loadSettings.mockResolvedValue({ settings: {}, synced: false });

    const page = await mount();
    await page.click(page.scanButton());

    expect(scannedModes(calls)).toHaveLength(1);
    await page.unmount();
  });

  it("押した時点の判定モードで走る（端末の設定を既定値で上書きしない）", async () => {
    setupDevice({ direction_filter_mode: "personal_kigaku_environmental" });
    const calls: string[] = [];
    stubFetch(calls);
    // クラウドは見に行かない（未ログイン）
    loadSettings.mockResolvedValue({ settings: {}, synced: false });

    const page = await mount();
    expect(page.modeSelect().value).toBe("personal_kigaku_environmental");
    await page.click(page.scanButton());

    expect(scannedModes(calls)[0]).toBe("personal_kigaku_environmental");
    await page.unmount();
  });

  it("クラウドの設定が届いてからでも、押した時点の設定で走る", async () => {
    setupDevice();
    const calls: string[] = [];
    stubFetch(calls);
    let releaseCloud!: () => void;
    loadSettings.mockImplementation(
      () =>
        new Promise((r) => {
          releaseCloud = () =>
            r({
              settings: {
                direction_filter_mode: "personal_kigaku_environmental",
              },
              synced: true,
            });
        }),
    );

    const page = await mount();
    /* まだ押していないので、クラウド待ちのあいだも 1 本も走っていない */
    expect(scannedModes(calls)).toEqual([]);

    await act(async () => {
      releaseCloud();
      await Promise.resolve();
    });
    await page.click(page.scanButton());

    expect(page.modeSelect().value).toBe("personal_kigaku_environmental");
    expect(scannedModes(calls)).toEqual(["personal_kigaku_environmental"]);
    await page.unmount();
  });

  it("走査したあとに範囲を変えると、押し直しを促す", async () => {
    setupDevice();
    const calls: string[] = [];
    stubFetch(calls);
    loadSettings.mockResolvedValue({ settings: {}, synced: false });

    const page = await mount();
    await page.click(page.scanButton());
    expect(page.text()).not.toContain("走査したあとで設定か範囲を変えました");

    /* 「未来」の範囲を変える。結果は消さず、古いことだけ出す */
    const future = [...page.container.querySelectorAll("select")].find((s) =>
      [...s.options].every((o) => /^(6|12|18|24)$/.test(o.value)),
    ) as HTMLSelectElement;
    await act(async () => {
      future.value = "24";
      future.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(page.text()).toContain("走査したあとで設定か範囲を変えました");
    /* 勝手には走り直さない */
    expect(scannedModes(calls)).toHaveLength(1);
    await page.unmount();
  });
});
