/**
 * 地面に描く八方位の扇形と二十四山の目盛り。
 *
 * 扇形の境目は sectorRange（判定と同じ伝統区分）から引き、方位角を八方位に
 * 落とすのは directionFromBearing だけ（CLAUDE.md 3 節）。二十四山は 15 度
 * 等分の**参照目盛り**で、判定には使わない。伝統区分（四正 30 度・四隅 60 度）
 * の境目とは一致しないので、色は八方位の扇形だけに付ける。
 */
import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  nodeMappingForBoard,
  directionFromBearing,
} from "@/utils/directionGeo";
import { sectorRange, bearingOfPoint } from "@/lib/threeBoardModel";
import { directionLabelName, haLabelForLayer } from "@/lib/directionLabels";
import { TIER_FILL } from "@/utils/tierDisplay";
import type { Judgement } from "./parsers";
import type { Point } from "./geo";
export const nodeMapping = nodeMappingForBoard(true);
export function polar(deg: number, r: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
}
export function wedgePoints(start: number, end: number, r: number): Point[] {
  const n = Math.ceil((end - start) / 3);
  return [
    { x: 0, z: 0 },
    ...Array.from({ length: n + 1 }, (_, i) =>
      polar(start + ((end - start) * i) / n, r),
    ),
  ];
}
export function buildWedges(judge: Judgement | null) {
  return COMPASS_DIRECTIONS.map((direction) => {
    const d = judge?.directions.find((v) => v.direction === direction);
    const [start, end] = sectorRange(direction, nodeMapping);
    return {
      direction,
      start,
      end,
      label: DIRECTION_LABELS[direction],
      status: d
        ? d.status === "NOISE_HA"
          ? haLabelForLayer("final")
          : directionLabelName(d.status)
        : "判定なし",
      color: d ? TIER_FILL[d.tier] : null,
    };
  });
}
export function centroidDirection(p: Point) {
  return directionFromBearing(bearingOfPoint(p.x, p.z), nodeMapping);
}
// 二十四山は判定ではなく、真北に固定した参照目盛り。
export const MOUNTAINS = Array.from(
  "子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥壬",
);
export function mountainForBearing(deg: number): string {
  return MOUNTAINS[Math.floor(((((deg + 7.5) % 360) + 360) % 360) / 15)];
}
