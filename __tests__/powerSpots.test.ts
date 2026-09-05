import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  spotFromBase,
  POWER_SPOT_CLUSTER_BELOW_ZOOM,
  type PowerSpotFile,
} from "@/lib/powerSpots";
import {
  bearingBetween,
  directionFromBearing,
  DIRECTION_LABELS,
} from "@/utils/directionGeo";

const file = JSON.parse(
  readFileSync("src/data/powerSpots.json", "utf8"),
) as PowerSpotFile;

describe("powerSpots のデータ", () => {
  it("座標・名前・所在地が全部そろっていて、QID が重複しない", () => {
    const ids = new Set<string>();
    for (const s of file.spots) {
      expect(s.id, s.name).toMatch(/^Q\d+$/);
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(s.name.length, s.id).toBeGreaterThan(0);
      expect(s.lat, s.name).toBeGreaterThan(20);
      expect(s.lat, s.name).toBeLessThan(46);
      expect(s.lon, s.name).toBeGreaterThan(122);
      expect(s.lon, s.name).toBeLessThan(154);
      expect(s.pref, s.name).toMatch(/[都道府県]$/);
      expect(s.basis, s.name).toBe("諸国一宮");
    }
  });

  it("効果や利益を書いていない", () => {
    // 吹き出しに出るのは spots の文字列。CLAUDE.md 4 節の決め事
    // （効果・健康への影響を断定しない）を機械で守る。ファイル冒頭の
    // note は「効果や利益は含まない」という否定の説明なので対象外。
    const text = JSON.stringify(file.spots);
    for (const banned of ["ご利益", "効果", "運気", "エネルギー", "浄化"]) {
      expect(text.includes(banned), banned).toBe(false);
    }
  });
});

describe("spotFromBase", () => {
  const base = { lat: 35.6812, lon: 139.7671 }; // 東京駅
  const ise = { lat: 34.455, lon: 136.7256 }; // 伊勢方面

  it("方位は物件・県・SpotVerdict と同じ経路で出す", () => {
    const r = spotFromBase(base.lat, base.lon, ise, false);
    expect(r).not.toBeNull();
    const expected = directionFromBearing(
      bearingBetween(base.lat, base.lon, ise.lat, ise.lon),
      "physical",
    );
    expect(r!.direction).toBe(expected);
    expect(r!.directionLabel).toBe(DIRECTION_LABELS[expected]);
    expect(r!.distanceKm).toBeGreaterThan(250);
    expect(r!.distanceKm).toBeLessThan(350);
    expect(r!.cell).toBeUndefined();
    expect(r!.unstableNote).toBeNull();
  });

  it("盤があればそのセルを借り、表示名も盤のものを使う", () => {
    const dir = directionFromBearing(
      bearingBetween(base.lat, base.lon, ise.lat, ise.lon),
      "traditional",
    );
    const r = spotFromBase(base.lat, base.lon, ise, true, {
      [dir]: {
        direction: dir,
        directionLabel: "盤の名前",
        tier: "A",
        blocked: false,
      },
    });
    expect(r!.cell?.tier).toBe("A");
    expect(r!.directionLabel).toBe("盤の名前");
  });

  it("5km 未満は方位が定まらない注意が付く", () => {
    const r = spotFromBase(
      base.lat,
      base.lon,
      { lat: base.lat + 0.01, lon: base.lon },
      false,
    );
    expect(r!.unstableNote).not.toBeNull();
  });

  it("出発地が無ければ null", () => {
    expect(spotFromBase(NaN, NaN, ise, false)).toBeNull();
  });

  it("まとめるズームの境目は県が見分けられる 8", () => {
    expect(POWER_SPOT_CLUSTER_BELOW_ZOOM).toBe(8);
  });
});
