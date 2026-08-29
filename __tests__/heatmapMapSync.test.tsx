import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolarTimeClock } from "@/components/SolarTimeClock";

vi.mock("next/dynamic", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: (loader: () => Promise<{ default: React.ComponentType }>) => {
      // ヒートマップのボタンはタブ分割（3/3）で home/DestinationMapPanel
      // （dynamic 読込）へ移った。押す対象なので、この 1 つだけは実体を
      // 描く。見分けはパネルにしか無い props（heatmapData）で行う。
      const Lazy = ReactModule.lazy(loader);
      return function DynamicComponentStub(props: Record<string, unknown>) {
        if ("heatmapData" in props) {
          return ReactModule.createElement(
            ReactModule.Suspense,
            { fallback: null },
            ReactModule.createElement(
              Lazy as React.ComponentType<Record<string, unknown>>,
              props,
            ),
          );
        }
        // 地図（TacticalMagneticMap）は従来どおりスタブ。渡された
        // activeLayerMode を出すだけにして、連動の結果を読む。
        if ("activeLayerMode" in props) {
          return ReactModule.createElement(
            "output",
            { "data-testid": "map-layer-mode" },
            String(props.activeLayerMode),
          );
        }
        return null;
      };
    },
  };
});

describe("ヒートマップと地図の時間軸連動", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("stc_activeTab", "destination");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("12か月は年+月、30日は全統合へ地図を自動で切り替える", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SolarTimeClock />);
      await Promise.resolve();
    });
    // DestinationMapPanel は React.lazy 経由で、モジュールの解決に
    // 数百 ms かかることがある（実測で 1 tick では足りない）。ボタンが
    // 出るまで待つ。上限を超えたら下の toBeDefined が実態を報告する。
    for (let i = 0; i < 40; i++) {
      const found = Array.from(container.querySelectorAll("button")).some(
        (candidate) => candidate.textContent?.trim() === "12ヶ月",
      );
      if (found) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }

    const button = (label: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    const mapLayerMode = () =>
      container.querySelector('[data-testid="map-layer-mode"]')?.textContent;

    expect(button("12ヶ月")).toBeDefined();
    expect(mapLayerMode()).toBe("final");

    await act(async () => {
      button("12ヶ月")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(mapLayerMode()).toBe("year_month");

    await act(async () => {
      button("30日")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mapLayerMode()).toBe("final");

    await act(async () => root.unmount());
    container.remove();
  });
});
