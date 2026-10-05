import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 調べている地点のピンを引きずって直せること。
 *
 * 住所が市の中心に潰れたとき（精度の断り）や、地図のクリックで少し
 * ずれたとき、もう一度クリックするより直感的。離した位置を判定へ送る
 * （地図のクリックと同じ受け口 onInspectSpot）。受け口が無い地図では
 * 動かせない。
 */

type MarkerProps = {
  alt?: string;
  draggable?: boolean;
  eventHandlers?: {
    dragend?: (e: {
      target: { getLatLng: () => { lat: number; lng: number } };
    }) => void;
  };
  children?: React.ReactNode;
};
const markers: MarkerProps[] = [];

vi.mock("react-leaflet", async () => {
  const React_ = await vi.importActual<typeof import("react")>("react");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement("div", null, children);
  const Nothing = () => null;
  return {
    MapContainer: Passthrough,
    TileLayer: Nothing,
    Marker: (props: MarkerProps) => {
      markers.push(props);
      return React_.createElement("div", null, props.children);
    },
    Polygon: Nothing,
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

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

describe("地点のピンを引きずって直す", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    markers.length = 0;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderMap(
    extra: Partial<React.ComponentProps<typeof ArbitrageMapInner>>,
  ) {
    await act(async () => {
      root.render(
        <ArbitrageMapInner
          baseLat={KYOTO.lat}
          baseLon={KYOTO.lon}
          useTrueNorth={false}
          layerMode="year"
          hasBase
          spotPin={NAGOYA}
          {...extra}
        />,
      );
    });
  }

  function spotMarker(): MarkerProps {
    const m = markers.find((p) => p.alt === "確認する候補の所在地");
    expect(m).toBeDefined();
    return m!;
  }

  it("受け口があれば動かせて、離した位置を onInspectSpot に渡す", async () => {
    const onInspectSpot = vi.fn();
    await renderMap({ onInspectSpot });
    const m = spotMarker();
    expect(m.draggable).toBe(true);
    m.eventHandlers?.dragend?.({
      target: { getLatLng: () => ({ lat: 35.2, lng: 136.95 }) },
    });
    expect(onInspectSpot).toHaveBeenCalledWith(35.2, 136.95);
    expect(container.textContent).toContain("ピンを動かすか");
  });

  it("受け口が無ければ動かせない（吹き出しもピンの話をしない）", async () => {
    await renderMap({});
    expect(spotMarker().draggable).toBe(false);
    expect(container.textContent).not.toContain("ピンを動かすか");
  });
});
