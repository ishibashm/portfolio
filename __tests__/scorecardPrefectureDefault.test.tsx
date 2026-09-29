import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolarTimeClock } from "@/components/SolarTimeClock";

/**
 * 30 日の見通しで街を並べる県は、**出発地のある県**から始める。
 *
 * 以前は誰にでも "愛知県" から始まり、選択肢も 9 県だけだった。
 * 出発地が京都の人は愛知の街を並べられ、長野の人は自分の県を選べなかった。
 * 出発地が利用者の値でないときは全国に倒す（画面の初期値の東京駅から
 * 県を決めない。#1100）。座標は公開の代表点（京都市）。
 */

vi.mock("next/dynamic", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    default: (loader: () => Promise<{ default: React.ComponentType }>) => {
      const Lazy = ReactModule.lazy(loader);
      return function DynamicStub(props: Record<string, unknown>) {
        /* 30 日の見通しの札（ScorecardPanel）だけ実体を描く */
        if ("scorecardPrefecture" in props) {
          return ReactModule.createElement(
            ReactModule.Suspense,
            { fallback: null },
            ReactModule.createElement(
              Lazy as React.ComponentType<Record<string, unknown>>,
              props,
            ),
          );
        }
        return null;
      };
    },
  };
});

const KYOTO = { lat: 35.0116, lon: 135.7681 };

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("stc_activeTab", "scorecard");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const wealthPrefectures = () =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith("/api/municipalities-wealth"))
    .map((url) => new URL(url, "http://x").searchParams.get("prefecture"));

async function open() {
  await act(async () => {
    root.render(<SolarTimeClock />);
    await Promise.resolve();
  });
  for (let i = 0; i < 60; i++) {
    if (container.querySelector('[aria-label="対象県"]')) break;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe("30 日の見通しの対象県", () => {
  it("出発地が登録されていれば、その県から始める", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ base_lat: KYOTO.lat, base_lon: KYOTO.lon }),
    );
    await open();
    expect(wealthPrefectures().at(-1)).toBe("京都府");
    const select =
      container.querySelector<HTMLSelectElement>('[aria-label="対象県"]')!;
    expect(select.value).toBe("base");
    expect(select.selectedOptions[0].textContent).toBe("出発地の県（京都府）");
  });

  it("出発地が未登録なら全国（画面の初期値の東京から県を決めない）", async () => {
    await open();
    const sent = wealthPrefectures();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent).not.toContain("愛知県");
    expect(sent).not.toContain("東京都");
    expect(sent.at(-1)).toBe("all");
    const select =
      container.querySelector<HTMLSelectElement>('[aria-label="対象県"]')!;
    expect(select.selectedOptions[0].textContent).toBe(
      "出発地の県（未登録のため全国）",
    );
  });

  it("47 都道府県をすべて選べる（JIS の順）", async () => {
    await open();
    const values = Array.from(
      container.querySelector<HTMLSelectElement>('[aria-label="対象県"]')!
        .options,
    ).map((o) => o.value);
    expect(values.slice(0, 2)).toEqual(["base", "all"]);
    const prefs = values.slice(2);
    expect(prefs).toHaveLength(47);
    expect(prefs[0]).toBe("北海道");
    expect(prefs.at(-1)).toBe("沖縄県");
    expect(prefs).toContain("長野県");
  });
});
