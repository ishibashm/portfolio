import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 調べている地点のピンの吹き出しに、その地点の判定（方位・段階・距離）が
 * 出て、立った瞬間に開くこと。
 *
 * 狭い画面では判定の札（左の列）と地図（下）が同時に見えない。住所を
 * 入れて地図へ送られた人は、ピンを押さないと何も分からなかった。
 *
 * 判定は SpotVerdict と同じ evaluateSpot で、盤も同じ dirKigaku を借りる。
 * ここで別に計算すると左の札と食い違う。
 */

type MarkerProps = {
  alt?: string;
  eventHandlers?: { add?: (e: { target: { openPopup: () => void } }) => void };
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
import { evaluateSpot } from "@/lib/spotEvaluation";

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

/* 京都 → 名古屋は伝統区分で東。盤は東だけ吉1盤、他は平 */
const dirKigaku = Object.fromEntries(
  (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const).map((d) => [
    d,
    {
      direction: d,
      directionLabel: {
        N: "北",
        NE: "北東",
        E: "東",
        SE: "南東",
        S: "南",
        SW: "南西",
        W: "西",
        NW: "北西",
      }[d],
      tier: d === "E" ? "B" : "C",
      blocked: false,
    },
  ]),
);

describe("調べている地点のピンの吹き出し", () => {
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
          useClassical
          dirKigaku={dirKigaku}
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

  it("方位・段階・距離が出る（SpotVerdict と同じ evaluateSpot の答え）", async () => {
    await renderMap({ spotPin: { ...NAGOYA, name: "愛知県名古屋市中村区" } });
    spotMarker();
    const ev = evaluateSpot(
      KYOTO.lat,
      KYOTO.lon,
      NAGOYA.lat,
      NAGOYA.lon,
      true,
      dirKigaku,
    );
    expect(ev?.direction).toBe("E");
    const text = container.textContent ?? "";
    expect(text).toContain("愛知県名古屋市中村区");
    expect(text).toContain("東");
    expect(text).toContain("吉1盤");
    expect(text).toContain(`約${ev!.distanceKm.toFixed(1)}km`);
  });

  it("立った瞬間に吹き出しを開く（add で openPopup）", async () => {
    await renderMap({ spotPin: NAGOYA });
    const openPopup = vi.fn();
    spotMarker().eventHandlers?.add?.({ target: { openPopup } });
    expect(openPopup).toHaveBeenCalledTimes(1);
  });

  it("盤が無い（生年月日が未入力）ときは方位と距離だけで、段階を出さない", async () => {
    await renderMap({ spotPin: NAGOYA, dirKigaku: undefined });
    spotMarker();
    const text = container.textContent ?? "";
    expect(text).toContain("約");
    expect(text).not.toContain("吉1盤");
  });

  it("出発地が無いときは判定を出さない（(0,0) からの方位を出さない）", async () => {
    await renderMap({ spotPin: NAGOYA, hasBase: false });
    spotMarker();
    expect(container.textContent).not.toContain("km");
  });
});
