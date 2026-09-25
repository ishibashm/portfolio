import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readTimingView, writeTimingView } from "@/lib/timingViewState";
import { allCategories } from "@/lib/timingFilter";

/**
 * 方位で街を探していて、その日に方位が塞がっていたら、引っ越し時期へ
 * 戻って開く日を探せること（利用者の依頼、2026-09-25）。
 *
 *     方位を街で探すページで日取りがわるかったら、また引っ越し時期を
 *     分析するに戻れるようにしてほしい
 *
 * 頁の頭には「日を決めるのが先です。引っ越し時期で…」とあるが、方位を
 * 選んで街を見ている途中で、その方位が塞がっていると分かったときに
 * 戻る入口が無かった。塞がっている方位の札にリンクを置き、時期の頁は
 * その方位（?dir=）で始める。
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

import { HousingStatsByDirection } from "@/components/relocation/HousingStatsByDirection";
import TimingAnalyticsPage from "@/app/relocation/timing/page";

/** 京都市南区（公開の代表点）。 */
const KYOTO = { lat: 34.9819, lon: 135.7444 };

const RESPONSE = {
  directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d) => ({
    direction: d,
    count: 1,
    rentCount: 1,
    medianRentPerSqm: 1800,
    medianMonthlyRentEstimate: null,
    vacancyRate: null,
    vacancyCount: 0,
    nearestKm: 20,
    topMunicipalities: [],
    municipalities: [],
    truncated: false,
  })),
  meta: {
    municipalitiesScanned: 8,
    dataYear: 2023,
    minKm: 5,
    maxKm: 150,
    nodeMapping: "traditional",
    source: "出典：政府統計の総合窓口(e-Stat)",
    credit: "e-Stat",
  },
};

const verdict = (tier: string, blocked = false) => ({ tier, blocked });

describe("方位ごとの街: 塞がっている方位から時期の頁へ", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("塞がっている方位にだけ、その方位つきのリンクを出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RESPONSE })),
    );
    render(
      <HousingStatsByDirection
        lat={KYOTO.lat}
        lon={KYOTO.lon}
        radiusKm={150}
        hasBase
        nodeMapping="traditional"
        verdicts={{
          N: verdict("S"),
          NE: verdict("X"),
          E: verdict("A"),
          SE: verdict("A", true),
          S: verdict("B"),
          SW: verdict("C"),
          W: verdict("B"),
          NW: verdict("A"),
        }}
      />,
    );
    const links = await screen.findAllByRole("link", {
      name: /開く日を引っ越し時期で探す/,
    });
    expect(links.map((l) => l.getAttribute("href")).sort()).toEqual([
      "/relocation/timing?dir=NE",
      "/relocation/timing?dir=SE",
    ]);
  });

  it("判定が無ければ出さない（塞がっているかどうか分からない）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RESPONSE })),
    );
    render(
      <HousingStatsByDirection
        lat={KYOTO.lat}
        lon={KYOTO.lon}
        radiusKm={150}
        hasBase
        nodeMapping="traditional"
      />,
    );
    await screen.findByText(/方位別の家賃相場/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(
      screen.queryByRole("link", { name: /開く日を引っ越し時期で探す/ }),
    ).toBeNull();
  });
});

describe("時期の頁: ?dir= の方位で始める", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    loadSettings.mockResolvedValue({ settings: {}, synced: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never,
    );
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  async function mountAt(search: string) {
    window.history.replaceState(null, "", `/relocation/timing${search}`);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TimingAnalyticsPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => root.unmount());
    container.remove();
  }

  it("保存していた方位より、渡された方位を優先する", async () => {
    writeTimingView(localStorage, {
      pastMonths: 6,
      futureMonths: 18,
      focusDir: "N",
      tierFilter: allCategories(),
      luckyOnly: false,
    });
    await mountAt("?dir=SE");
    expect(readTimingView(localStorage).focusDir).toBe("SE");
  });

  it("知らない値は無視して、保存していた方位のまま", async () => {
    writeTimingView(localStorage, {
      pastMonths: 6,
      futureMonths: 18,
      focusDir: "N",
      tierFilter: allCategories(),
      luckyOnly: false,
    });
    await mountAt("?dir=XX");
    expect(readTimingView(localStorage).focusDir).toBe("N");
  });
});
