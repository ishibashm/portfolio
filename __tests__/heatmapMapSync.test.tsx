import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolarTimeClock } from "@/components/SolarTimeClock";

vi.mock("next/dynamic", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  return {
    default: () =>
      function DynamicComponentStub(props: Record<string, unknown>) {
        if ("activeLayerMode" in props) {
          return ReactModule.createElement(
            "output",
            { "data-testid": "map-layer-mode" },
            String(props.activeLayerMode),
          );
        }
        return null;
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

    const button = (label: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    const mapLayerMode = () =>
      container.querySelector('[data-testid="map-layer-mode"]')?.textContent;

    expect(button("12 MONTHS")).toBeDefined();
    expect(mapLayerMode()).toBe("final");

    await act(async () => {
      button("12 MONTHS")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(mapLayerMode()).toBe("year_month");

    await act(async () => {
      button("30 DAYS")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(mapLayerMode()).toBe("final");

    await act(async () => root.unmount());
    container.remove();
  });
});
