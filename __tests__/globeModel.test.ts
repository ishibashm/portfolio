import { describe, expect, it } from "vitest";
import {
  azimuthalEquidistant,
  boundaryLines,
  classifyCities,
  rhumbBearing,
  rhumbDestination,
  toXYZ,
} from "@/lib/globeModel";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
  normalizeBearing,
  type NodeMapping,
} from "@/utils/directionGeo";
import { MUNICIPALITY_POINTS } from "@/lib/municipalityCoords";

/**
 * 地球儀の上の方位の扇形（利用者の依頼「他の 3D の案も」、2026-09-30）。
 *
 * - 扇形の縁は大圏で、出発地から見た方位角が境目の値そのもの（判定と一致）
 * - 比べる「地図の直線」は等角航路で、向きが一定
 * - 街の方位は判定と同じ。地図の直線で見ると別の方位に見える街は、
 *   2 つの向きのあいだに境目がある街だけ
 */

const TOKYO = { lat: 35.6895, lon: 139.6917 };
const angDiff = (a: number, b: number) =>
  Math.abs(normalizeBearing(a - b + 180) - 180);

describe("球の上の点", () => {
  it("半径の上にあり、北極が +y、経度 0 が +z、東経 90 度が +x", () => {
    const [x, y, z] = toXYZ(TOKYO.lat, TOKYO.lon, 5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(5, 12);
    expect(toXYZ(90, 0)[1]).toBeCloseTo(1, 12);
    expect(toXYZ(0, 0)[2]).toBeCloseTo(1, 12);
    expect(toXYZ(0, 90)[0]).toBeCloseTo(1, 12);
  });
});

describe("地図の直線（等角航路）", () => {
  it("どこまで進んでも向きが一定", () => {
    for (const b of [15, 45, 75, 105, 200, 300]) {
      for (const km of [100, 800, 2500]) {
        const p = rhumbDestination(TOKYO, b, km);
        expect(angDiff(rhumbBearing(TOKYO, p), b), `${b} ${km}`).toBeLessThan(
          1e-6,
        );
      }
    }
  });
});

describe.each<NodeMapping>(["traditional", "physical"])("%s", (mapping) => {
  const lines = boundaryLines(TOKYO, mapping, 3000);

  it("扇形の縁（大圏）は、出発地から見てちょうど境目の方位角", () => {
    for (const l of lines) {
      for (const p of l.greatCircle.slice(1)) {
        const b = bearingBetween(TOKYO.lat, TOKYO.lon, p.lat, p.lon);
        expect(angDiff(b, l.bearing)).toBeLessThan(1e-6);
      }
      // 境目のすぐ内側はその方位、すぐ外側は隣
      expect(directionFromBearing(l.bearing + 0.01, mapping)).toBe(l.direction);
      expect(directionFromBearing(l.bearing - 0.01, mapping)).not.toBe(
        l.direction,
      );
    }
  });

  it("地図の直線は遠いほど大圏から離れる", () => {
    const near = boundaryLines(TOKYO, mapping, 500);
    for (const [i, l] of lines.entries()) {
      expect(l.gapKm).toBeGreaterThan(near[i].gapKm);
      expect(l.gapKm).toBeGreaterThan(1);
    }
  });

  it("街の方位は判定と同じで、食い違う街は 2 つの向きのあいだに境目がある", () => {
    const cities = MUNICIPALITY_POINTS.map((m) => ({
      code: m.code,
      name: `${m.pref}${m.city}`,
      lat: m.lat,
      lon: m.lon,
    }));
    const out = classifyCities(TOKYO, cities, mapping);
    expect(out.length).toBeGreaterThan(1000);
    let differs = 0;
    for (const c of out) {
      expect(c.direction).toBe(
        directionFromBearing(
          bearingBetween(TOKYO.lat, TOKYO.lon, c.lat, c.lon),
          mapping,
        ),
      );
      if (c.differs) {
        differs++;
        // 大圏の向きと地図の直線の向きのあいだに、どれかの境目がある
        const between = lines.some((l) => {
          const lo = Math.min(
            0,
            normalizeBearing(c.mapBearing - c.bearing + 180) - 180,
          );
          const hi = Math.max(
            0,
            normalizeBearing(c.mapBearing - c.bearing + 180) - 180,
          );
          const e = normalizeBearing(l.bearing - c.bearing + 180) - 180;
          return e >= lo - 1e-9 && e <= hi + 1e-9;
        });
        expect(between, c.name).toBe(true);
      }
    }
    // 東京からだと、地図の直線で見ると別の方位に見える街がある
    expect(differs).toBeGreaterThan(0);
  });
});

describe("正距方位図法（平面の図）", () => {
  it("中心からの長さは距離、向きは方位角。大圏の縁は中心からの直線", () => {
    const [l] = boundaryLines(TOKYO, "traditional", 3000);
    for (const p of l.greatCircle.slice(1)) {
      const [e, n] = azimuthalEquidistant(TOKYO, p);
      expect(Math.hypot(e, n)).toBeCloseTo(
        distanceKmBetween(TOKYO.lat, TOKYO.lon, p.lat, p.lon),
        6,
      );
      const b = normalizeBearing((Math.atan2(e, n) * 180) / Math.PI);
      expect(angDiff(b, l.bearing)).toBeLessThan(1e-6);
    }
  });
});
