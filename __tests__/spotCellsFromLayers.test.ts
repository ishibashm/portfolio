import { describe, it, expect } from "vitest";
import { spotCellsFromLayers } from "@/lib/spotCellsFromLayers";
import { stepDayTier } from "@/lib/stepTier";
import { COMPASS_DIRECTIONS } from "@/utils/directionGeo";

const all = (v: string) =>
  Object.fromEntries(COMPASS_DIRECTIONS.map((d) => [d, v])) as Record<
    string,
    string
  >;

describe("spotCellsFromLayers", () => {
  it("層が無ければ undefined（吹き出しは「段階は…入れると出ます」に落ちる）", () => {
    expect(spotCellsFromLayers(null, null)).toBeUndefined();
    expect(spotCellsFromLayers(undefined, "N")).toBeUndefined();
  });

  it("段階は stepDayTier と同じ答え（別に計算しない）", () => {
    // 吉は OPTIMAL（utils/auspiciousDays の isAuspicious が見る語）。
    // 三盤とも吉で最終も吉なら S、五黄殺が 1 つでもあれば X。
    const layers: Record<string, Record<string, string>> = {
      yearLayer: { ...all("SAFE"), N: "OPTIMAL", E: "NOISE_GOU" },
      monthLayer: { ...all("SAFE"), N: "OPTIMAL" },
      dayLayer: { ...all("SAFE"), N: "OPTIMAL" },
      finalVectors: { ...all("SAFE"), N: "OPTIMAL", E: "NOISE_GOU" },
    };
    const cells = spotCellsFromLayers(
      {
        yearLayer: layers.yearLayer,
        monthLayer: layers.monthLayer,
        dayLayer: layers.dayLayer,
        finalVectors: layers.finalVectors,
      },
      null,
    )!;
    expect(Object.keys(cells)).toHaveLength(8);
    for (const d of COMPASS_DIRECTIONS) {
      expect(cells[d].tier, d).toBe(
        stepDayTier({
          status: layers.finalVectors[d],
          details: {
            yearLayer: layers.yearLayer[d],
            monthLayer: layers.monthLayer[d],
            dayLayer: layers.dayLayer[d],
          },
        }),
      );
      expect(cells[d].direction).toBe(d);
      expect(cells[d].blocked).toBe(false);
    }
    expect(cells.N.tier).toBe("S");
    expect(cells.E.tier).toBe("X");
    expect(cells.N.directionLabel).toBe("北");
  });

  it("最終に無い方位は入れない。土用殺の方位だけ doyouSatsu が立つ", () => {
    const layers = {
      yearLayer: {},
      monthLayer: {},
      dayLayer: {},
      finalVectors: { N: "SAFE", SW: "NOISE_GOU" },
    };
    const cells = spotCellsFromLayers(layers, "SW")!;
    expect(Object.keys(cells).sort()).toEqual(["N", "SW"]);
    expect(cells.SW.doyouSatsu).toBe(true);
    expect(cells.N.doyouSatsu).toBe(false);
    expect(cells.SW.tier).toBe("X");
  });
});
