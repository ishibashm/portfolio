import { describe, expect, it } from "vitest";
import {
  destinationAtBearing,
  directionWedgePoints,
} from "@/utils/directionGeo";

/**
 * ホームの地図（MagneticMapInner）の扇形の**縁**が、方位の境目に沿って
 * いるか。
 *
 * ## 見つけた不具合（2026-08-31）
 *
 * 扇形は「中心から 1000km」で描いている。ところが旧実装は
 *
 *     points = [中心]
 *     for (offset = -halfWidth; offset <= halfWidth; offset += 5)
 *       points.push(getDestination(lat, lon, 中心方位 + offset, 1000));
 *
 * と、**中心と弧の点しか置いていなかった。**中心から弧の端までは
 * 地図上の直線で結ばれる。ところが方位の境目は大圏（曲線）なので、
 * 直線で結ぶと縁が内側へ食い込む。
 *
 * 実測（半径 1000km、稚内あたり・北北西、四正の半幅 15 度）で
 * **最大 2.71 度**、中点の位置で**横に 24km** ずれていた。境目から
 * 24km 以内の街は、実際には吉方位の中にあるのに扇形の外に描かれる。
 * #134 と同じ「描画と判定の基準がずれていた」類。
 *
 * 物件の地図（ArbitrageMapInner）は共通の directionWedgePoints を
 * 使っていて、こちらは縁も大圏に沿って刻んでいる。**同じ扇形を
 * 2 通りに書いていたせいで、片方だけが直っていなかった。**
 *
 * ## この検証の作り
 *
 * CLAUDE.md 3 節の手順どおり、**旧実装をここに写した**（oldWedgePoints）。
 * 新旧の両方に同じ検査を当て、旧が落ちること・新が通ることを見る。
 * 旧に戻すとこのファイルが落ちるので、空回りしない。
 */

/** 旧実装（MagneticMapInner にあったもの）。**戻さないこと。** */
function oldWedgePoints(
  lat: number,
  lon: number,
  centerBearing: number,
  halfWidthDeg: number,
  rangeKm: number,
): [number, number][] {
  const points: [number, number][] = [[lat, lon]];
  for (let offset = -halfWidthDeg; offset <= halfWidthDeg; offset += 5) {
    const p = destinationAtBearing(lat, lon, centerBearing + offset, rangeKm);
    points.push([p.lat, p.lon]);
  }
  return points;
}

/**
 * 描かれた多角形の中に点が入るか。地図上は緯度経度の平面に直線で
 * 描かれるので、その平面で判定する（レイキャスティング）。
 */
function isInsidePolygon(
  point: [number, number],
  polygon: [number, number][],
): boolean {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * **方位の境目のすぐ内側にある地点が、描かれた扇形に入っているか。**
 *
 * これが本題。境目から 0.2 度だけ内側（＝確実に吉方位の側）の点を、
 * 中心から 10 通りの距離で置き、多角形に入らなかった数を返す。
 * 0 なら「描かれた扇形＝判定の扇形」。
 */
function pointsMissedNearBoundary(
  polygon: [number, number][],
  lat: number,
  lon: number,
  centerBearing: number,
  halfWidthDeg: number,
  rangeKm: number,
): number {
  let missed = 0;
  for (const side of [-1, 1]) {
    /* 境目そのものは丸め次第でどちらにも転ぶので、0.2 度内側を見る */
    const bearing = centerBearing + side * (halfWidthDeg - 0.2);
    for (let k = 1; k <= 10; k++) {
      const km = (rangeKm * k) / 11;
      const p = destinationAtBearing(lat, lon, bearing, km);
      if (!isInsidePolygon([p.lat, p.lon], polygon)) missed++;
    }
  }
  return missed;
}

/** 全国から。北へ行くほど大圏の曲がりが効く。 */
const ORIGINS: [number, number, string][] = [
  [26.2124, 127.6809, "那覇"],
  [33.5902, 130.4017, "福岡"],
  [34.6937, 135.5023, "大阪"],
  [35.6895, 139.6917, "東京"],
  [43.0621, 141.3544, "札幌"],
  [45.4156, 141.6731, "稚内"],
];

/** 四正は半幅 15 度、四隅は 30 度（気学の伝統区分）。 */
const HALF_WIDTHS = [15, 30];
/** ホームの地図が実際に描く長さ。 */
const RANGE_KM = 1000;

describe("扇形の縁は方位の境目に沿う", () => {
  it("旧実装は境目のすぐ内側の地点を扇形の外に描く（空回りしていない証拠）", () => {
    let missed = 0;
    let checked = 0;
    for (const [lat, lon] of ORIGINS) {
      for (let bearing = 0; bearing < 360; bearing += 15) {
        for (const halfWidth of HALF_WIDTHS) {
          const points = oldWedgePoints(lat, lon, bearing, halfWidth, RANGE_KM);
          missed += pointsMissedNearBoundary(
            points,
            lat,
            lon,
            bearing,
            halfWidth,
            RANGE_KM,
          );
          checked += 20;
        }
      }
    }
    /* 吉方位の側にある地点が、描画では外に落ちている */
    expect(missed).toBeGreaterThan(0);
    /* どのくらい落ちているかも残す（直したあとに比べられるように） */
    expect(missed / checked).toBeGreaterThan(0.1);
  });

  it("新実装（共通の directionWedgePoints）は 1 点も落とさない", () => {
    let missed = 0;
    for (const [lat, lon] of ORIGINS) {
      for (let bearing = 0; bearing < 360; bearing += 15) {
        for (const halfWidth of HALF_WIDTHS) {
          const points = directionWedgePoints(
            lat,
            lon,
            bearing,
            halfWidth,
            RANGE_KM,
          );
          missed += pointsMissedNearBoundary(
            points,
            lat,
            lon,
            bearing,
            halfWidth,
            RANGE_KM,
          );
        }
      }
    }
    expect(missed).toBe(0);
  });

  it("扇形の端（弧の両端）は新旧で同じ（意味は変えていない）", () => {
    for (const [lat, lon] of ORIGINS) {
      for (const bearing of [0, 45, 135, 270]) {
        for (const halfWidth of HALF_WIDTHS) {
          const oldPts = oldWedgePoints(lat, lon, bearing, halfWidth, RANGE_KM);
          const newPts = directionWedgePoints(
            lat,
            lon,
            bearing,
            halfWidth,
            RANGE_KM,
          );
          expect(newPts[0][0]).toBeCloseTo(oldPts[0][0], 9);
          expect(newPts[0][1]).toBeCloseTo(oldPts[0][1], 9);

          for (const edge of [bearing - halfWidth, bearing + halfWidth]) {
            const tip = destinationAtBearing(lat, lon, edge, RANGE_KM);
            const has = (pts: [number, number][]) =>
              pts.some(
                (p) =>
                  Math.abs(p[0] - tip.lat) < 1e-9 &&
                  Math.abs(p[1] - tip.lon) < 1e-9,
              );
            expect(has(oldPts)).toBe(true);
            expect(has(newPts)).toBe(true);
          }
        }
      }
    }
  });
});
