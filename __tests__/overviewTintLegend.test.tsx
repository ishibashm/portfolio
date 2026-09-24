import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 俯瞰の県塗りが、何の色なのか画面から分かること。
 *
 * 出発地か生年月日が未入力だと prefKigaku が undefined になる。かつては
 * そのとき県の塗り分けが「方位の吉凶」から「掲載件数」へ無言で入れ替わり、
 * 件数の濃淡が吉凶に見えた。掲載の塗りは 2026-09-20 に物件の描画ごと
 * 外したので、いまは**判定が無ければ塗らず、その理由を凡例に出す。**
 * パネルごと消すと「塗られていない」ことも「何を入れれば塗られるか」も
 * 分からないので、消さない。
 *
 * 地図そのものは leaflet が要るので、ここでは凡例まわりだけを見る。
 */

// react-leaflet は本物の DOM 実寸を要求するので、jsdom では地図を描けない。
// 凡例は地図のレイヤの外にあるため、子をそのまま出すスタブで足りる。
//
// vitest はモックのエクスポートを実物と照合するので、使っているものは全部
// 挙げる（Proxy で受けようとしたら「No "Polygon" export」で弾かれた）。
vi.mock("react-leaflet", async () => {
  // vi.mock は import より前に巻き上げられるので、上の React をそのまま
  // 掴まない。importActual で取る（heatmapMapSync.test.tsx と同じ書き方）。
  const React_ = await vi.importActual<typeof import("react")>("react");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement("div", null, children);
  const Nothing = () => null;
  return {
    MapContainer: Passthrough,
    TileLayer: Nothing,
    Marker: Passthrough,
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

const KIGAKU = {
  東京都: {
    direction: "E",
    directionLabel: "東",
    tier: "S",
    blocked: false,
  },
};

function renderMap(props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root, props };
}

describe("俯瞰の県塗りが何の色か分かる", () => {
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

  /**
   * 描いて、本文と「塗り分けの切り替えボタン」を取り出す。
   *
   * unmount してから container を返すと中身が空になる（実際にそれで
   * 落とした）。見たいものはここで確定させてから返す。
   */
  async function renderLegend(extra: Record<string, unknown>) {
    const { container, root } = renderMap({});
    await act(async () => {
      root.render(
        <ArbitrageMapInner
          baseLat={35.6895}
          baseLon={139.6917}
          useTrueNorth={false}
          layerMode="year"
          keepWideView
          hasBase
          {...extra}
        />,
      );
    });

    const text = container.textContent ?? "";
    const snapshot = { text };

    await act(async () => root.unmount());
    return snapshot;
  }

  it("判定を出せないときは、塗っていない理由を出す", async () => {
    const { text } = await renderLegend({
      prefKigaku: undefined,
      kigakuUnavailableReason: "生年月日を入れると方位の吉凶で塗り分けます",
    });

    /* 既定は扇形で塗る見方（2026-09-24）。見出しもそれに合わせる */
    expect(text).toContain("方位の塗り分け");
    expect(text).toContain("生年月日を入れると方位の吉凶で塗り分けます");
    /* 掲載件数の色にはもう落ちない（物件を描かなくなった） */
    expect(text).not.toContain("掲載件数");
  });

  it("理由が渡らなくても、塗られる条件は必ず言う", async () => {
    const { text } = await renderLegend({ prefKigaku: undefined });
    expect(text).toContain("方位の吉凶で塗り分けます");
    expect(text).not.toContain("掲載件数");
  });

  it("判定を出せるときは段階の凡例が出る（扇形で塗る見方）", async () => {
    const { text } = await renderLegend({ prefKigaku: KIGAKU });

    expect(text).toContain("三盤吉");
    expect(text).toContain("五大凶殺");
    expect(text).toContain("扇形の中はどこでも同じ方位です");
    expect(text).not.toContain("条件が揃うと方位の吉凶で塗り分けます");
  });

  it("「県ごと」を選ぶと県の塗り分けに戻り、県の中心で決めた目安だと断る", async () => {
    localStorage.setItem("arb_overview_paint", "pref");
    const { text } = await renderLegend({ prefKigaku: KIGAKU });
    localStorage.removeItem("arb_overview_paint");

    expect(text).toContain("県の塗り分け");
    expect(text).toContain("出発地から見た各県の方位の、選択日の判定");
    expect(text).toContain("広い県は県内でも方位が変わります");
  });
});
