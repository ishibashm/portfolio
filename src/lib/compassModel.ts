/**
 * 羅盤（真北と磁北の針）の中身。**描くものは持たない。**
 *
 * このサイトの判定は**真北**で行い、磁北は「方位磁針で測るとずれる」注意
 * としてだけ出す（CLAUDE.md 3 節。/houi の記事が全国向けの静的ページで
 * 偏角を持てないため）。羅盤はその 2 つを 1 枚に重ねて見せる:
 *
 * - 盤（8 方位の扇形）は真北に合わせる。判定と同じ区切り
 * - 磁針は偏角ぶん回す。日本は西偏なので、磁針は真北より西を指す
 * - 方位磁針で測ったときに人が見る境目（磁北で切った扇形）を薄く重ねる。
 *   真北の境目との食い違いが、「測ると隣の方位に見える」帯になる
 * - 目的地を選ぶと、真北で見た方位と磁北で見た方位を並べる。どちらも
 *   directionForDestination（ホーム・地図と同じ関数）で出す
 *
 * 偏角が引けないときは 0（補正なし）。東京の値で埋めない（CLAUDE.md 3 節）。
 */

import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  bearingBetween,
  directionForDestination,
  distanceKmBetween,
  normalizeBearing,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";
import { sectorRange } from "@/lib/threeBoardModel";

export interface CompassPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface CompassSector {
  direction: CompassDirection;
  label: string;
  /** 真北で切った境目（判定と同じ）。北は 345〜375 のように開く */
  startDeg: number;
  endDeg: number;
  /** 方位磁針で測ったときに見える境目（真北の方位角で表す） */
  magStartDeg: number;
  magEndDeg: number;
}

export interface CompassTarget {
  place: CompassPlace;
  /** 真北から時計回り */
  trueBearing: number;
  /** 方位磁針で測った値（磁北から時計回り） */
  magneticBearing: number;
  trueDirection: CompassDirection;
  magneticDirection: CompassDirection;
  /** 測ると隣の方位に見える */
  differs: boolean;
  distanceKm: number;
  /** 真北の境目までの近さ（度）。偏角より近いと、測り方で方位が変わりうる */
  marginDeg: number;
}

export interface CompassModel {
  origin: CompassPlace;
  mapping: NodeMapping;
  /** 偏角（東が正）。引けなかったときは 0 */
  declination: number;
  declinationKnown: boolean;
  /** 磁針が指す向き（真北から時計回り） */
  needleDeg: number;
  sectors: CompassSector[];
  target: CompassTarget | null;
}

/**
 * 真北の方位角 b の点を、方位磁針で測った値。偏角 D（東が正）の土地では
 * 磁北が真北から D 度東にあるので、磁北から測ると D 度小さく出る。
 */
export function magneticBearingOf(trueBearing: number, declination: number) {
  return normalizeBearing(trueBearing - declination);
}

/** 方位角 b から、区間 [a, e] の境目までの近さ（度）。区間の外なら 0 */
function marginTo(b: number, a: number, e: number): number {
  let p = normalizeBearing(b);
  if (p < a) p += 360;
  if (p > e) return 0;
  return Math.min(p - a, e - p);
}

export function buildCompassModel(
  origin: CompassPlace,
  declination: number | null,
  target: CompassPlace | null,
  mapping: NodeMapping = "traditional",
): CompassModel {
  const known = declination !== null && Number.isFinite(declination);
  const d = known ? declination! : 0;
  const sectors: CompassSector[] = COMPASS_DIRECTIONS.map((direction) => {
    const [startDeg, endDeg] = sectorRange(direction, mapping);
    return {
      direction,
      label: DIRECTION_LABELS[direction],
      startDeg,
      endDeg,
      /* 方位磁針で「北」と読む範囲は、磁北から測って北の区間。真北で
         言い直すと偏角ぶん足した所（磁北が真北から d 度にあるため） */
      magStartDeg: startDeg + d,
      magEndDeg: endDeg + d,
    };
  });
  let t: CompassTarget | null = null;
  if (target) {
    const trueBearing = bearingBetween(
      origin.lat,
      origin.lon,
      target.lat,
      target.lon,
    );
    const trueDirection = directionForDestination(
      origin.lat,
      origin.lon,
      target.lat,
      target.lon,
      d,
      true,
      mapping,
    );
    const magneticDirection = directionForDestination(
      origin.lat,
      origin.lon,
      target.lat,
      target.lon,
      d,
      false,
      mapping,
    );
    const sec = sectors.find((s) => s.direction === trueDirection)!;
    t = {
      place: target,
      trueBearing,
      magneticBearing: magneticBearingOf(trueBearing, d),
      trueDirection,
      magneticDirection,
      differs: trueDirection !== magneticDirection,
      distanceKm: distanceKmBetween(
        origin.lat,
        origin.lon,
        target.lat,
        target.lon,
      ),
      marginDeg: marginTo(trueBearing, sec.startDeg, sec.endDeg),
    };
  }
  return {
    origin,
    mapping,
    declination: d,
    declinationKnown: known,
    needleDeg: normalizeBearing(d),
    sectors,
    target: t,
  };
}

/** 偏角の言い方。「西へ 7.9 度」 */
export function declinationText(declination: number): string {
  const abs = Math.abs(declination).toFixed(1);
  if (Math.abs(declination) < 0.05) return "ずれはほぼありません";
  return `${declination < 0 ? "西" : "東"}へ ${abs} 度`;
}
