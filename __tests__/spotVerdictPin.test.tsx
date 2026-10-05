import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 住所を入れて「調べる」を押したら、地図にピンが立つこと。
 *
 * 利用者の報告（2026-10-05）「住所入力したけどピン立たない」。
 *
 * 以前は、地図のピンは「地図でこの地点を見る →」を押したとき
 * （focusKind が "spot" になったとき）だけ立っていた。住所を入れて
 * 「調べる」を押しても判定の札は出るのに、地図には何も出ない。
 *
 * 直し方は 2 段。
 *   1. SpotVerdict が決めた点を `onTargetChange` で頁へ知らせる
 *   2. 地図（ArbitrageMapInner）は `spotPin` があれば focusKind に
 *      関係なくピンを立てる
 */

const polygonCalls: Record<string, unknown>[] = [];
const markerAlts: string[] = [];

vi.mock("react-leaflet", async () => {
  const React_ = await vi.importActual<typeof import("react")>("react");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement("div", null, children);
  const Nothing = () => null;
  return {
    MapContainer: Passthrough,
    TileLayer: Nothing,
    Marker: (props: { alt?: string; children?: React.ReactNode }) => {
      if (props.alt) markerAlts.push(props.alt);
      return React_.createElement("div", null, props.children);
    },
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

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

describe("住所を調べたら頁へ地点を知らせる（SpotVerdict）", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("住所 → 調べる で onTargetChange が座標つきで呼ばれる（地図のクリックではない）", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith("/api/geocode?"))
        return new Response(
          JSON.stringify({
            lat: NAGOYA.lat,
            lon: NAGOYA.lon,
            name: "愛知県名古屋市中村区",
            source: "gsi",
          }),
        );
      /* 逆引き（入口のリンク）は無しで良い */
      return new Response("{}", { status: 404 });
    });
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
      />,
    );
    /* 開いた時点では地点が無い */
    expect(onTargetChange).toHaveBeenLastCalledWith(null, false);
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "愛知県名古屋市中村区名駅1丁目" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        { lat: NAGOYA.lat, lon: NAGOYA.lon, name: "愛知県名古屋市中村区" },
        false,
      ),
    );
  });

  it("地図のクリックで来た点は fromMap=true（頁は寄せ直さない）", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
        requestedPoint={{ lat: NAGOYA.lat, lon: NAGOYA.lon, seq: 1 }}
      />,
    );
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ lat: NAGOYA.lat, lon: NAGOYA.lon }),
        true,
      ),
    );
  });
});

describe("地図は spotPin があればピンを立てる（ArbitrageMapInner）", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    markerAlts.length = 0;
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
          {...extra}
        />,
      );
    });
  }

  it("focusKind が area のままでも、spotPin があればピンが立つ", async () => {
    await renderMap({
      focusKind: "area",
      spotPin: { ...NAGOYA, name: "愛知県名古屋市中村区" },
    });
    expect(markerAlts).toContain("確認する候補の所在地");
    expect(container.textContent).toContain("愛知県名古屋市中村区");
  });

  it("spotPin が無く、地点へ寄せてもいないときは立てない（従来どおり）", async () => {
    await renderMap({ focusKind: "area", spotPin: null });
    expect(markerAlts).not.toContain("確認する候補の所在地");
  });
});
