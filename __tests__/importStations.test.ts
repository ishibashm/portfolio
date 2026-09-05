import { describe, it, expect } from "vitest";
import { midpointOf, stationsFromFeatures } from "../scripts/import_stations";

const seg = (
  name: string,
  group: string,
  op: string,
  line: string,
  coords: number[][],
) => ({
  geometry: { type: "LineString", coordinates: coords },
  properties: {
    N02_003: line,
    N02_004: op,
    N02_005: name,
    N02_005c: group,
    N02_005g: group,
  },
});

describe("midpointOf", () => {
  it("線分の座標の平均。経度・緯度の順で読む", () => {
    expect(
      midpointOf({
        type: "LineString",
        coordinates: [
          [139, 35],
          [139.002, 35.002],
        ],
      }),
    ).toEqual([expect.closeTo(35.001, 6), expect.closeTo(139.001, 6)]);
  });
  it("LineString でない・日本の外・空は null", () => {
    expect(midpointOf({ type: "Point", coordinates: [139, 35] })).toBeNull();
    expect(midpointOf({ type: "LineString", coordinates: [] })).toBeNull();
    expect(
      midpointOf({ type: "LineString", coordinates: [[35, 139]] }),
    ).toBeNull();
    expect(midpointOf(undefined)).toBeNull();
  });
});

describe("stationsFromFeatures", () => {
  it("グループコードで畳み、路線名は表を番号で指す。並びは id", () => {
    const r = stationsFromFeatures([
      seg("汐留", "003887", "ゆりかもめ", "東京臨海新交通臨海線", [
        [139.759, 35.664],
        [139.76, 35.665],
      ]),
      seg("汐留", "003887", "東京都", "大江戸線", [
        [139.7595, 35.6645],
        [139.7605, 35.6655],
      ]),
      seg("二月田", "010112", "九州旅客鉄道", "指宿枕崎線", [
        [130.63, 31.254],
        [130.631, 31.255],
      ]),
    ]);
    expect(r.stations.map((s) => s.id)).toEqual(["003887", "010112"]);
    expect(r.stations[0].name).toBe("汐留");
    expect(r.stations[0].l.map((i) => r.lineNames[i])).toEqual([
      "ゆりかもめ 東京臨海新交通臨海線",
      "東京都 大江戸線",
    ]);
    expect(r.stations[0].lat).toBeCloseTo(35.66475, 4);
    expect(r.stations[1].l.map((i) => r.lineNames[i])).toEqual([
      "九州旅客鉄道 指宿枕崎線",
    ]);
    expect(r.lineNames).toHaveLength(3);
    expect(r.dropped).toEqual([]);
  });

  it("駅名やコードが無い・座標が読めないものは理由つきで落とす", () => {
    const r = stationsFromFeatures([
      {
        geometry: { type: "LineString", coordinates: [[139, 35]] },
        properties: { N02_005: "" },
      },
      seg("外", "1", "a", "b", [[10, 10]]),
      seg("正", "2", "a", "b", [[139, 35]]),
    ]);
    expect(r.stations).toHaveLength(1);
    expect(r.dropped.map((d) => d.count)).toEqual([1, 1]);
  });

  it("同じ路線が複数の駅にあっても表は 1 行", () => {
    const r = stationsFromFeatures([
      seg("A", "1", "op", "ln", [[139, 35]]),
      seg("B", "2", "op", "ln", [[139.1, 35.1]]),
    ]);
    expect(r.lineNames).toEqual(["op ln"]);
    expect(r.stations.map((s) => s.l)).toEqual([[0], [0]]);
  });
});
