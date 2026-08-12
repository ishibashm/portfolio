import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 方位の扇形が、地図を動かしただけで消えないこと。
 *
 * 件数バブル（showHeatmap）は「見えている物件が 120 件以上」で**自動的に**
 * 入る。扇形をその裏で消していたため、地図を物件の多い側へ寄せただけで
 * 方位の境目がひとりでに消えていた。利用者から「地図を移動させると方位の
 * 円が解除される」として報告された。
 *
 * 扇形はこの画面の主役なので、下に別の意味の色（件数）があるときは
 * 塗りだけ外し、境界線は残す。
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

/** 件数バブルが入る条件（120 件以上）を満たすだけの物件。 */
function makeProperties(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    property_name: `物件${i}`,
    rent: 60000,
    management_fee: 3000,
    layout: "1K",
    size_sqm: 25,
    is_new_build: false,
    minutes_to_station: 8,
    address: "滋賀県草津市",
    lat: 35.0 + (i % 10) * 0.01,
    lon: 136.0 + (i % 10) * 0.01,
    building_age: 10,
    floor: "2",
    url: null,
    totalRent: 63000,
    propSqmRent: 2520,
    distanceKm: 40,
    direction: "E",
    magneticDirection: "E",
    astrologyStatus: "SAFE",
    astrologyScore: 50,
    yieldScore: 50,
  }));
}

const KIGAKU = {
  E: { direction: "E", directionLabel: "東", tier: "S", blocked: false },
  W: { direction: "W", directionLabel: "西", tier: "S", blocked: false },
};

async function renderMap(propertyCount: number) {
  polygonCalls.length = 0;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ArbitrageMapInner
        properties={makeProperties(propertyCount) as never}
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

describe("方位の扇形は地図を動かしても残る", () => {
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

  it("物件が少ないときは 8 方位ぶん描く", async () => {
    const wedges = await renderMap(10);
    expect(wedges).toHaveLength(8);
  });

  it("件数バブルに切り替わっても消えない", async () => {
    // 120 件以上でバブルが自動的に入る。以前はここで扇形ごと消えていた。
    const wedges = await renderMap(130);
    expect(wedges, "件数バブル中に扇形が消えている").toHaveLength(8);
  });

  it("下に別の意味の色があるときは塗らず、境界線だけ残す", async () => {
    // 塗ってしまうと件数の色と混ざり、どちらの意味か読めなくなる。
    const wedges = await renderMap(130);
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
          properties={[]}
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
