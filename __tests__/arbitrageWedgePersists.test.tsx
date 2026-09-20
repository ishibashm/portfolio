import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 方位の扇形が、他の層の都合で消えないこと。
 *
 * かつて件数バブル（見えている物件が 120 件以上で自動的に入る層）の裏で
 * 扇形を消していて、地図を物件の多い側へ寄せただけで方位の境目が
 * ひとりでに消えていた（利用者の報告「地図を移動させると方位の円が
 * 解除される」）。物件の描画は 2026-09-20 に外したが、同じ形は用途地域・
 * ハザードにもある。
 *
 * 扇形はこの画面の主役なので、下に別の意味の色があるときは塗りだけ外し、
 * 境界線は残す。
 */

const polygonCalls: Record<string, unknown>[] = [];

vi.mock("react-leaflet", async () => {
  const React_ = await vi.importActual<typeof import("react")>("react");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement("div", null, children);
  const Nothing = () => null;
  return {
    MapContainer: Passthrough,
    TileLayer: Nothing,
    Marker: Passthrough,
    // 扇形はここに来る。pathOptions を控えて後で見る。
    Polygon: (props: Record<string, unknown>) => {
      polygonCalls.push(props);
      return null;
    },
    Circle: Nothing,
    CircleMarker: Nothing,
    Popup: Passthrough,
    GeoJSON: Nothing,
    useMap: () => ({
      setView: () => {},
      fitBounds: () => {},
      getZoom: () => 5,
      invalidateSize: () => {},
    }),
    useMapEvents: () => ({ getZoom: () => 5 }),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("@/components/map/InvalidateMapSize", () => ({
  InvalidateMapSize: () => null,
}));

import ArbitrageMapInner from "@/components/ArbitrageMapInner";

const KIGAKU = {
  E: { direction: "E", directionLabel: "東", tier: "S", blocked: false },
  W: { direction: "W", directionLabel: "西", tier: "S", blocked: false },
};

/* モックの useMapEvents は zoom 5 を返すので、描かれるのは俯瞰の扇形。 */
async function renderMap() {
  polygonCalls.length = 0;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ArbitrageMapInner
        baseLat={35.0116}
        baseLon={135.7681}
        useTrueNorth={false}
        layerMode="year"
        hasBase
        dirKigaku={KIGAKU as never}
      />,
    );
  });
  const wedges = polygonCalls.filter((p) => Array.isArray(p.positions));
  await act(async () => root.unmount());
  return wedges;
}

describe("方位の扇形は他の層を出しても残る", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never,
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("判定があれば 8 方位ぶん描く", async () => {
    const wedges = await renderMap();
    expect(wedges).toHaveLength(8);
  });

  it("下に別の意味の色（俯瞰の県塗り）があるときは塗らず、境界線だけ残す", async () => {
    // 塗ってしまうと県塗りと混ざり、どちらの意味か読めなくなる。
    const wedges = await renderMap();
    for (const w of wedges) {
      const opts = w.pathOptions as { fillOpacity: number; weight: number };
      expect(opts.fillOpacity).toBe(0);
      expect(opts.weight).toBeGreaterThan(0);
    }
  });

  it("出発地が無いときは描かない", async () => {
    // baseLat/baseLon が地図の中心に倒れており、どこから見た方位でもない。
    polygonCalls.length = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ArbitrageMapInner
          baseLat={35.0116}
          baseLon={135.7681}
          useTrueNorth={false}
          layerMode="year"
        />,
      );
    });
    const wedges = polygonCalls.filter((p) => Array.isArray(p.positions));
    await act(async () => root.unmount());
    expect(wedges).toHaveLength(0);
  });
});
