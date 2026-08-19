import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  HAZARD_TABS,
  HAZARD_OPACITY,
  normalizeHazardTab,
} from "@/lib/hazardLayers";

/*
  react-leaflet の TileLayer は MapContainer の外では描けないので、
  受け取った props を記録するだけの器に差し替える。ここで見たいのは
  「どの URL を何枚、どの濃さで頼んだか」だけで、Leaflet の描画は
  見たいものに入っていない。
*/
const rendered: Record<string, unknown>[] = [];
vi.mock("react-leaflet", () => ({
  TileLayer: (props: Record<string, unknown>) => {
    rendered.push(props);
    return null;
  },
}));

import { HazardTileOverlay } from "@/components/HazardTileOverlay";

/**
 * ハザードマップの重ね描き（国交省「重ねるハザードマップ」）の固定。
 *
 * ## この環境から配信の生死は確かめられない
 *
 * サンドボックスの proxy が *.gsi.go.jp への接続を遮断しているため、
 * タイル URL が生きているかはここでは検証できない。**URL の形と
 * 組み立てだけを固定し、絵が出るかはデプロイ後に目で確かめる**
 * （区域外は 404 = 透明で返る仕様なので、死んだ URL も画面上は
 * 「何も出ない」にしかならない。疑わしければ disaportal.gsi.go.jp で
 * 同じ場所を開いて見比べる）。
 */

describe("タイルの一覧", () => {
  it("全タブの URL が国交省の配信元で、{z}/{x}/{y} を持つ", () => {
    for (const [id, def] of Object.entries(HAZARD_TABS)) {
      expect(def.layers.length, `${id} にレイヤーが無い`).toBeGreaterThan(0);
      for (const layer of def.layers) {
        expect(layer.url).toMatch(
          /^https:\/\/disaportaldata\.gsi\.go\.jp\/raster\/[a-z0-9_]+\/\{z\}\/\{x\}\/\{y\}\.png$/,
        );
        // 国交省の利用規約は出典の明示を求めている。
        expect(layer.attribution).toContain("ハザードマップポータルサイト");
      }
    }
  });

  it("土砂は 3 区域（土石流・急傾斜地・地すべり）を重ねる", () => {
    // 配信側が 3 つの別タイルに分けている。1 つでは「土砂」を名乗れない。
    expect(HAZARD_TABS.sediment.layers).toHaveLength(3);
  });

  it("下地が透ける濃さになっている", () => {
    // 1.0 だと下地が消えて、どこの話か分からなくなる。
    expect(HAZARD_OPACITY).toBeGreaterThan(0);
    expect(HAZARD_OPACITY).toBeLessThan(1);
  });
});

describe("normalizeHazardTab", () => {
  it("知らない値・欠けた値は none に倒す", () => {
    for (const v of [null, undefined, "", "FLOOD", "all", 1, {}]) {
      expect(normalizeHazardTab(v)).toBe("none");
    }
    expect(normalizeHazardTab("sediment")).toBe("sediment");
  });
});

describe("HazardTileOverlay", () => {
  it("none では何も頼まない", () => {
    rendered.length = 0;
    render(<HazardTileOverlay tab="none" />);
    expect(rendered).toHaveLength(0);
  });

  it("洪水は 1 枚、土砂は 3 枚を頼む", () => {
    rendered.length = 0;
    render(<HazardTileOverlay tab="flood" />);
    expect(rendered).toHaveLength(1);

    rendered.length = 0;
    render(<HazardTileOverlay tab="sediment" />);
    expect(rendered).toHaveLength(3);
    for (const p of rendered) {
      expect(p.opacity).toBe(HAZARD_OPACITY);
      expect(p.maxNativeZoom).toBe(17);
    }
  });
});
