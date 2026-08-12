import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 俯瞰の県塗りが、何の色なのか画面から分かること。
 *
 * 出発地か生年月日が未入力だと prefKigaku が undefined になり、県の塗り分けが
 * 「方位の吉凶」から「掲載件数」へ無言で入れ替わっていた。どちらも同じ県を
 * 色で塗るので、利用者には件数の濃淡が吉凶に見える。さらに切り替えパネル
 * ごと消えていたため、方位モードが存在することも分からなかった。
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

describe("俯瞰の塗り分けが何の色か分かる", () => {
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
          properties={[]}
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
    const buttons = [...container.querySelectorAll("button")];
    const byLabel = (label: string) =>
      buttons.find((b) => b.textContent === label);
    const snapshot = {
      text,
      kigakuButton: byLabel("方位の吉凶"),
      countButton: byLabel("掲載件数"),
    };

    await act(async () => root.unmount());
    return snapshot;
  }

  it("判定を出せないときは、件数の色だと明記して理由も出す", async () => {
    const { text } = await renderLegend({
      prefKigaku: undefined,
      kigakuUnavailableReason: "生年月日を入れると方位の吉凶で塗り分けます",
    });

    expect(text).toContain("いまの色は掲載件数です");
    expect(text).toContain("生年月日を入れると方位の吉凶で塗り分けます");
  });

  it("判定を出せないときも「方位の吉凶」のボタンを消さない", async () => {
    // 消すとモードの存在自体が分からず、件数の色を吉凶と読み違える。
    const { kigakuButton, countButton } = await renderLegend({
      prefKigaku: undefined,
      kigakuUnavailableReason: "出発地を入れると方位の吉凶で塗り分けます",
    });

    expect(kigakuButton, "「方位の吉凶」ボタンが見つからない").toBeTruthy();
    expect(kigakuButton!.disabled).toBe(true);
    expect(kigakuButton!.getAttribute("title")).toContain("出発地");
    // 件数側は押せるままにしておく（モードの存在が分かるように）
    expect(countButton!.disabled).toBe(false);
  });

  it("理由が渡らなくても、色の意味は必ず言う", async () => {
    const { text } = await renderLegend({ prefKigaku: undefined });
    expect(text).toContain("いまの色は掲載件数です");
    expect(text).toContain("方位の吉凶で塗り分けます");
  });

  it("判定を出せるときは方位の凡例が出て、押せる", async () => {
    const { text, kigakuButton } = await renderLegend({ prefKigaku: KIGAKU });

    expect(text).toContain("三盤吉");
    expect(text).toContain("五大凶殺");
    // 既定は方位モードなので、件数の見出しは出さない
    expect(text).not.toContain("いまの色は掲載件数です");
    expect(kigakuButton!.disabled).toBe(false);
  });

  it("件数の温度計は、吉凶ではないと分かる見出しを持つ", async () => {
    // 「件数」とだけ書いてあり、吉凶の色と見分けが付かなかった。
    const { text } = await renderLegend({ prefKigaku: undefined });
    expect(text).toContain("掲載件数");
    expect(text).toContain("吉凶ではない");
  });
});
