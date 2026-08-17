import { describe, it, expect } from "vitest";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_BEARINGS,
  directionWedgeHalfWidth,
  directionFromBearing,
  normalizeBearing,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * ホームの地図（MagneticMapInner）の扇形を、真北基準で描くようにした件の固定。
 *
 * 変更前は扇形も境界の赤帯も偏角のぶん回して描いていた。
 *
 *   const magNorthBearing = useTrueNorth ? 0 : declination;
 *   const baseBearing = magNorthBearing + d.deg;
 *
 * `useTrueNorth` の初期値は偽なので、**既定では全体が偏角のぶん回っていた。**
 * 扇形を塗り分けている吉凶は真北基準で出したものなので、真北で出した判定を
 * 磁北の位置に置いて描いていたことになる。
 *
 * 影響は「見た目が少し回る」では済まない。伝統区分の四正（N/E/S/W）は
 * 幅 30 度しかないので、偏角 7 度なら扇形の 4 分の 1 近くが、
 * directionFromBearing では隣の方位に当たる帯になる。arbitrage / wealth の
 * 物件は directionFromBearing（真北）で方位を割り当てているため、同じ地点が
 * 地図では扇形の中なのに一覧では隣の方位、ということが起きていた。
 *
 * ここでは
 *
 *   1. 旧実装の方位角を legacySectorBearing として写し、
 *   2. 新実装（真北）の扇形が directionFromBearing と往復することを
 *      両方の区分・全方位・扇形の端まで含めて固定し、
 *   3. **旧実装だと往復しない**ことを日本の偏角の範囲で示す
 *
 * の 3 つを置く。
 */

/** 変更前の扇形の中心方位角。**現行実装のどこからも呼ばれていない。** */
function legacySectorBearing(
  direction: CompassDirection,
  declination: number,
): number {
  return declination + DIRECTION_BEARINGS[direction];
}

/** 変更後。偏角を足さない。 */
function sectorBearing(direction: CompassDirection): number {
  return DIRECTION_BEARINGS[direction];
}

/** 扇形の中を 1 度刻みで見る（端は境界そのものなので少し内側に寄せる）。 */
function insideWedge(centerBearing: number, halfWidth: number): number[] {
  const EDGE_MARGIN = 0.5;
  const out: number[] = [];
  for (let o = -halfWidth + EDGE_MARGIN; o <= halfWidth - EDGE_MARGIN; o += 1) {
    out.push(normalizeBearing(centerBearing + o));
  }
  return out;
}

const MAPPINGS: ("traditional" | "physical")[] = ["traditional", "physical"];

/** 日本の偏角のおよその幅。西偏なので負。 */
const JAPAN_DECLINATIONS = [-9, -8, -7, -6, -5];

describe("ホームの地図の扇形", () => {
  it("扇形の中はどこを取っても、その方位として判定される", () => {
    const mismatches: string[] = [];

    for (const mapping of MAPPINGS) {
      for (const dir of COMPASS_DIRECTIONS) {
        const half = directionWedgeHalfWidth(dir, mapping);
        for (const bearing of insideWedge(sectorBearing(dir), half)) {
          const judged = directionFromBearing(bearing, mapping);
          if (judged !== dir) {
            mismatches.push(`${mapping} ${dir} の ${bearing}度 → ${judged}`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("旧実装（偏角ぶん回す）では扇形の中が別の方位になる（この修正の対象）", () => {
    for (const declination of JAPAN_DECLINATIONS) {
      const mismatches: string[] = [];

      for (const mapping of MAPPINGS) {
        for (const dir of COMPASS_DIRECTIONS) {
          const half = directionWedgeHalfWidth(dir, mapping);
          const center = legacySectorBearing(dir, declination);
          for (const bearing of insideWedge(center, half)) {
            if (directionFromBearing(bearing, mapping) !== dir) {
              mismatches.push(`${mapping} ${dir} の ${bearing}度`);
            }
          }
        }
      }

      // 旧実装を戻すとここで落ちる。空回りするテストを避けるための確認。
      expect(
        mismatches.length,
        `偏角 ${declination} 度で食い違いが出ていない`,
      ).toBeGreaterThan(0);
    }
  });

  it("偏角 7 度のとき、伝統区分の四正は幅の 4 分の 1 前後がずれる", () => {
    // 「少し回るだけ」ではないことを数で残す。四正は幅 30 度しかない。
    const declination = -7;
    const dir: CompassDirection = "N";
    const half = directionWedgeHalfWidth(dir, "traditional");
    expect(half * 2).toBe(30);

    const wrong = insideWedge(
      legacySectorBearing(dir, declination),
      half,
    ).filter((b) => directionFromBearing(b, "traditional") !== dir);

    // 30 度のうち 7 度ぶん（1 度刻みで 7 点）が隣の方位に当たる。
    expect(wrong.length).toBe(7);
  });
});
