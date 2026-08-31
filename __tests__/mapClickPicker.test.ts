import { describe, expect, it } from "vitest";
import { isBareMapClick } from "@/components/map/MapClickPicker";

/**
 * 地図のクリックで座標を選ぶとき、**操作部品の上のクリックを拾わない。**
 *
 * ## なぜ検査するか（実際に起きた事故）
 *
 * この守りは 3 か所のうち 1 か所（物件の地図）にしか無かった。
 * 残る 2 つ（ホームの目的地タブ・出発地の選択）は、地図の中に置いた
 * ボタンを押しただけで**その真下の座標が選ばれていた。**出発地が
 * 勝手に書き換わり、方位の判定まで変わる。
 *
 * 守りを 1 か所に寄せたので、ここが落ちたら 3 つ全部が壊れる。
 */

function el(className: string, parentClass?: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  if (parentClass) {
    const parent = document.createElement("div");
    parent.className = parentClass;
    parent.appendChild(node);
  }
  return node;
}

describe("isBareMapClick", () => {
  it("地図そのものへのクリックは拾う", () => {
    expect(isBareMapClick(el("leaflet-tile"))).toBe(true);
    expect(isBareMapClick(el("leaflet-container"))).toBe(true);
  });

  it("操作部品の上は拾わない（ボタンそのもの）", () => {
    expect(isBareMapClick(el("leaflet-control"))).toBe(false);
  });

  it("操作部品の中の要素も拾わない（ボタンの中の文字など）", () => {
    expect(isBareMapClick(el("text", "leaflet-control"))).toBe(false);
  });

  it("吹き出しとピンも拾わない", () => {
    expect(isBareMapClick(el("leaflet-popup"))).toBe(false);
    expect(isBareMapClick(el("body", "leaflet-popup"))).toBe(false);
    expect(isBareMapClick(el("leaflet-marker-icon"))).toBe(false);
  });

  it("HTMLElement でない相手は地図とみなす（SVG など）", () => {
    expect(isBareMapClick(null)).toBe(true);
  });
});
