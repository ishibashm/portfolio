import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 時期ツールの走査は、**画面に出ている判定の設定と同じ設定で**走っている
 * こと。
 *
 * 利用者報告（2026-09-19）。select は「本命星＋環境方位」なのに、同行者の
 * 欄には「私（東）が 506 日『天中殺』」と出ていた。走査は composite の
 * ままで、select だけが切り替わっていた。原因は 2 つ。
 *
 *   1. 最初の描画が判定の設定を既定値（composite）固定で持っていて、
 *      端末に保存してある本命星＋環境方位を読んでいなかった
 *   2. 最初の走査が返る前にクラウドの設定が届いても、`days === null` の
 *      ときしか走らせない作りだったので走査し直さなかった
 *
 * ここでは fetch に渡した directionFilterMode を見る。走査の中身は
 * API の側の見張り（directionFilterLayers ほか）が持つ。
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
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
    },
    modeSelect: () =>
      [...container.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "composite"),
      ) as HTMLSelectElement,
  };
}

const EMPTY_SCAN = {
  ok: true,
  json: async () => ({ days: [], members: [], honmeiStar: 7, voidZodiacs: [] }),
};

describe("走査は画面の判定の設定と同じ設定で走る", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("端末に保存してある判定モードで最初の走査を始める", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        birth_date: "1957-09-22T12:00",
        base_lat: 35.0116,
        base_lon: 135.7681,
        direction_filter_mode: "personal_kigaku_environmental",
      }),
    );
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return EMPTY_SCAN;
      }) as never,
    );
    // クラウドは見に行かない（未ログイン）
    loadSettings.mockResolvedValue({ settings: {}, synced: false });

    const page = await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(scannedModes(calls)[0]).toBe("personal_kigaku_environmental");
    expect(page.modeSelect().value).toBe("personal_kigaku_environmental");
    await page.unmount();
  });

  it("走査の途中でクラウドの設定が届いたら、その設定で走査し直す", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        birth_date: "1957-09-22T12:00",
        base_lat: 35.0116,
        base_lon: 135.7681,
      }),
    );
    const calls: string[] = [];
    let releaseFetch!: () => void;
    const gate = new Promise<void>((r) => (releaseFetch = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        // 最初の走査だけ、クラウドの設定が届くまで返さない
        if (calls.filter((u) => u.startsWith(SCAN_URL)).length === 1) {
          await gate;
        }
        return EMPTY_SCAN;
      }) as never,
    );
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
    expect(scannedModes(calls)).toEqual(["composite"]);

    // 走査が返る前にクラウドの設定が届く
    await act(async () => {
      releaseCloud();
      await Promise.resolve();
    });
    // 走査が返る
    await act(async () => {
      releaseFetch();
      await new Promise((r) => setTimeout(r, 10));
    });

    // select と走査が同じ設定になっている
    expect(page.modeSelect().value).toBe("personal_kigaku_environmental");
    expect(scannedModes(calls)).toEqual([
      "composite",
      "personal_kigaku_environmental",
    ]);
    await page.unmount();
  });

  it("設定が変わっていなければ走査し直さない", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        birth_date: "1957-09-22T12:00",
        base_lat: 35.0116,
        base_lon: 135.7681,
        direction_filter_mode: "composite",
      }),
    );
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return EMPTY_SCAN;
      }) as never,
    );
    loadSettings.mockResolvedValue({
      settings: { direction_filter_mode: "composite" },
      synced: true,
    });
    const page = await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(scannedModes(calls)).toEqual(["composite"]);
    await page.unmount();
  });
});
