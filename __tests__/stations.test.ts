import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  stationViews,
  STATION_CLUSTER_BELOW_ZOOM,
  STATIONS_ATTRIBUTION,
  type StationsFile,
} from "@/lib/stations";

const file = JSON.parse(
  readFileSync("src/data/stations.json", "utf8"),
) as StationsFile;

describe("stations.json", () => {
  it("全国の駅の桁で、座標が日本の中にあり、id が重複しない", () => {
    expect(file.stations.length).toBeGreaterThan(8000);
    const ids = new Set<string>();
    for (const s of file.stations) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(s.name.length, s.id).toBeGreaterThan(0);
      expect(s.lat).toBeGreaterThan(20);
      expect(s.lat).toBeLessThan(46);
      expect(s.lon).toBeGreaterThan(122);
      expect(s.lon).toBeLessThan(154);
      for (const i of s.l) expect(file.lineNames[i], s.id).toBeTypeOf("string");
    }
  });

  it("出典を持っている（帰属表示の根拠）", () => {
    expect(file.source).toContain("国土数値情報");
    expect(STATIONS_ATTRIBUTION).toContain("国土数値情報（鉄道データ）");
  });
});

describe("stationViews", () => {
  it("番号を路線名に引き直す。壊れた番号は捨てる", () => {
    const v = stationViews({
      source: "",
      sourceUrl: "",
      note: "",
      generatedAt: "",
      lineNames: ["a 1", "b 2"],
      stations: [{ id: "x", name: "駅", lat: 35, lon: 139, l: [1, 0, 9] }],
    });
    expect(v).toEqual([
      { id: "x", name: "駅", lat: 35, lon: 139, lines: ["b 2", "a 1"] },
    ]);
  });

  it("升目にまとめる境目は z11（1 万点を俯瞰に置かない）", () => {
    expect(STATION_CLUSTER_BELOW_ZOOM).toBe(11);
  });
});
