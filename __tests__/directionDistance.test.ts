import { describe, expect, it } from "vitest";
import {
  DIRECTION_UNSTABLE_KM,
  directionUnstableNote,
  isDirectionUnstable,
  sectorShiftMeters,
} from "@/lib/directionDistance";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";

/**
 * 近すぎる移動では方位が定まらない、という事実。
 *
 * 方位は出発地から見た向きで決まるので、距離が短いほど「実際にどう動いたか」
 * より「ピンをどこに置いたか」で決まる。判定そのものは変えず、当てに
 * ならない距離だと画面に添えるために使う。
 *
 * 距離で吉凶の強弱を変えるかどうかは流派差があるので、ここでは扱わない
 * （docs/improvement-backlog.md の E）。
 */

describe("方位が変わる横ずれ", () => {
  it("距離に比例する", () => {
    // 45 度等分の半分（22.5 度）ぶん振れると隣の方位になる。
    expect(sectorShiftMeters(1)).toBe(414);
    expect(sectorShiftMeters(5)).toBe(2071);
    expect(sectorShiftMeters(50)).toBe(20711);
  });

  it("近いほど小さい＝少しのずれで方位が変わる", () => {
    expect(sectorShiftMeters(0.5)).toBeLessThan(sectorShiftMeters(1));
    expect(sectorShiftMeters(1)).toBeLessThan(sectorShiftMeters(10));
  });

  it("1km では住所の誤差の範囲で方位が変わる", () => {
    // ジオコーディングは町丁目まで。誤差は数百 m ある。
    expect(sectorShiftMeters(1)).toBeLessThan(500);
  });

  it("閾値の 5km では、誤差では変わらない大きさになる", () => {
    expect(sectorShiftMeters(DIRECTION_UNSTABLE_KM)).toBeGreaterThan(2000);
  });

  it("0 や不正な値で壊れない", () => {
    for (const v of [0, -1, NaN, Infinity]) {
      expect(sectorShiftMeters(v), String(v)).toBe(0);
    }
  });
});

describe("方位が定まらない距離", () => {
  it("5km 未満なら定まらない扱い", () => {
    expect(isDirectionUnstable(0.3)).toBe(true);
    expect(isDirectionUnstable(4.9)).toBe(true);
  });

  it("5km ちょうどからは定まる扱い", () => {
    expect(isDirectionUnstable(5)).toBe(false);
    expect(isDirectionUnstable(50)).toBe(false);
  });

  it("不正な値は「定まらない」に倒さない（警告を出しっぱなしにしない）", () => {
    expect(isDirectionUnstable(NaN)).toBe(false);
    expect(isDirectionUnstable(Infinity)).toBe(false);
  });
});

describe("画面に出す一文", () => {
  it("近いときは距離と横ずれを具体的に言う", () => {
    const note = directionUnstableNote(1);
    expect(note).toContain("1.0km");
    expect(note).toContain("414m");
  });

  it("十分離れていれば何も言わない", () => {
    expect(directionUnstableNote(5)).toBeNull();
    expect(directionUnstableNote(120)).toBeNull();
  });
});

describe("距離の計算", () => {
  it("同じ地点は 0", () => {
    expect(distanceKmBetween(35, 135, 35, 135)).toBeCloseTo(0, 6);
  });

  it("京都〜名古屋がおよそ 110km", () => {
    const km = distanceKmBetween(34.9911, 135.7248, 35.1815, 136.9064);
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(120);
  });
});

describe("実際に方位が変わることを確かめる", () => {
  it("1km の移動は、横に 500m ずらすと方位が変わる", () => {
    // 事実の裏取り。閾値の根拠がここにある。
    const lat = 35,
      lon = 135;
    // 東へ 1km（緯度はほぼ変わらない）
    const east = [lat, lon + 0.011] as const;
    // そこから北へ約 500m
    const shifted = [lat + 0.0045, lon + 0.011] as const;

    const d1 = directionFromBearing(
      bearingBetween(lat, lon, east[0], east[1]),
      "physical",
    );
    const d2 = directionFromBearing(
      bearingBetween(lat, lon, shifted[0], shifted[1]),
      "physical",
    );
    expect(d1).not.toBe(d2);
  });

  it("100km の移動なら、同じ 500m のずれでは変わらない", () => {
    const lat = 35,
      lon = 135;
    const far = [lat, lon + 1.1] as const;
    const shifted = [lat + 0.0045, lon + 1.1] as const;

    const d1 = directionFromBearing(
      bearingBetween(lat, lon, far[0], far[1]),
      "physical",
    );
    const d2 = directionFromBearing(
      bearingBetween(lat, lon, shifted[0], shifted[1]),
      "physical",
    );
    expect(d1).toBe(d2);
  });
});
