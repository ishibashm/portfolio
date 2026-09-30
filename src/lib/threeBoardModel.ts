/**
 * 三盤の方位盤（/calendar の立体の盤と、その平面の代わり）の中身。
 * **純粋な関数だけ。**描画（three.js・SVG）はこれを読むだけにする。
 *
 * ## 精度をどこで担保するか
 *
 * - 扇形の角度は `directionAngleRange`（方位の境目の唯一の定義）から取る。
 *   伝統（四正 30 度・四隅 60 度）と均等（45 度）を切り替えられる。
 *   描画の側で角度を書かない
 * - 盤の九星と方位ごとの吉凶は、API（mode=board）が判定エンジンの 1 回の
 *   計算から返したものをそのまま使う。ここで判定をし直さない
 * - 吉・凶の区別は noiseSeverity（isAuspiciousStatus・isNoise）、呼び名は
 *   directionLabels、段階の色は tierDisplay。どれも既存の唯一の定義
 * - 立体の盤で押した点の方位は `directionFromBearing` で決める
 *
 * 判定エンジン（auspiciousDays・ephemerisEngine）は値として import しない。
 * このファイルは client の部品が読むので、エンジン一式がバンドルに乗る。
 */

import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  directionAngleRange,
  directionFromBearing,
  normalizeBearing,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";
import { isAuspiciousStatus, isNoise } from "@/utils/noiseSeverity";
import {
  directionLabelBadge,
  directionLabelName,
  haLabelForLayer,
} from "@/lib/directionLabels";
import { TIER_FILL, TIER_JP } from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/dayTier";

export type BoardLayerKey = "year" | "month" | "day";

/** API（auspicious-days?mode=board）の応答 */
export interface BoardResponse {
  date: string;
  honmeiStar: number;
  voidZodiacs: string[];
  tenchusatsuMode: string;
  boards: Record<BoardLayerKey, Record<string, number>>;
  directions: Record<
    string,
    {
      yearLayer: string;
      monthLayer: string;
      dayLayer: string;
      finalStatus: string;
      tier: string;
      blocked: boolean;
      doyouSatsu: boolean;
      tendo: boolean;
    }
  >;
}

/**
 * 応答が盤の形をしているか。3 つの盤と 8 方位の判定がそろっていなければ
 * 描かない（盤の口を持たない古いサーバーは日の一覧を返す）。
 */
export function isBoardResponse(body: unknown): body is BoardResponse {
  if (typeof body !== "object" || body === null) return false;
  if (!("boards" in body) || !("directions" in body)) return false;
  const { boards, directions } = body;
  if (typeof boards !== "object" || boards === null) return false;
  if (typeof directions !== "object" || directions === null) return false;
  const layers: BoardLayerKey[] = ["year", "month", "day"];
  if (!layers.every((l) => l in boards)) return false;
  return COMPASS_DIRECTIONS.every((d) => d in directions);
}

export type SectorKind = "good" | "neutral" | "bad";

export interface Sector {
  direction: CompassDirection;
  label: string;
  /** 真北から時計回りの方位角。start < end（北は 345 → 375 のように広げる） */
  startDeg: number;
  endDeg: number;
  /** その盤でこの方位に入る九星（1〜9） */
  star: number;
  status: string;
  statusLabel: string;
  /** 盤面に彫る短い呼び名（扇形が狭いので）。平は「平」 */
  badge: string;
  kind: SectorKind;
}

export interface BoardDisc {
  layer: BoardLayerKey;
  name: string;
  /** 中宮の星 */
  center: number;
  sectors: Sector[];
}

export interface DirectionColumn {
  direction: CompassDirection;
  label: string;
  startDeg: number;
  endDeg: number;
  tier: DayTier | null;
  tierLabel: string;
  color: string;
  blocked: boolean;
  doyouSatsu: boolean;
  /** 三盤とも吉（段階 S）。立体では 3 枚を貫く光の柱にする */
  aligned: boolean;
}

export interface ThreeBoardModel {
  date: string;
  mapping: NodeMapping;
  /** 下から年盤・月盤・日盤の順 */
  discs: BoardDisc[];
  columns: DirectionColumn[];
}

const LAYER_NAME: Record<BoardLayerKey, string> = {
  year: "年盤",
  month: "月盤",
  day: "日盤",
};
const LAYER_FIELD = {
  year: "yearLayer",
  month: "monthLayer",
  day: "dayLayer",
} as const;

/** 九星の名前（中宮や扇形に彫る） */
export const STAR_NAMES: Record<number, string> = {
  1: "一白",
  2: "二黒",
  3: "三碧",
  4: "四緑",
  5: "五黄",
  6: "六白",
  7: "七赤",
  8: "八白",
  9: "九紫",
};

export function sectorKind(status: string): SectorKind {
  if (isAuspiciousStatus(status)) return "good";
  if (isNoise(status)) return "bad";
  return "neutral";
}

/** 盤ごとの呼び名。破は盤によって歳破・月破・日破に読み替える */
export function statusLabelFor(status: string, layer: BoardLayerKey): string {
  if (status === "NOISE_HA") return haLabelForLayer(layer);
  return directionLabelName(status);
}

/** 盤面に彫る短い呼び名。破は盤ごと、札の無い平は「平」 */
export function statusBadgeFor(status: string, layer: BoardLayerKey): string {
  if (status === "NOISE_HA") return haLabelForLayer(layer);
  return directionLabelBadge(status) || "平";
}

/**
 * 方位の扇形の角度。directionAngleRange の [始まり, 終わり] を、
 * 始まり < 終わり になるよう広げる（北は 345〜15 → 345〜375）。
 */
export function sectorRange(
  direction: CompassDirection,
  mapping: NodeMapping,
): [number, number] {
  const [a, b] = directionAngleRange(direction, mapping);
  return b < a ? [a, b + 360] : [a, b];
}

/**
 * 盤の上の点（北が -z、東が +x）の方位角。立体の盤で押した点の方位を
 * 出すのに使う。
 */
export function bearingOfPoint(x: number, z: number): number {
  return normalizeBearing((Math.atan2(x, -z) * 180) / Math.PI);
}

/** 押した点の方位。境目の扱いは判定と同じ directionFromBearing */
export function directionOfPoint(
  x: number,
  z: number,
  mapping: NodeMapping,
): CompassDirection {
  return directionFromBearing(bearingOfPoint(x, z), mapping);
}

function isTier(t: string): t is DayTier {
  return t in TIER_FILL;
}

export function buildThreeBoardModel(
  res: BoardResponse,
  mapping: NodeMapping,
): ThreeBoardModel {
  const discs: BoardDisc[] = (["year", "month", "day"] as const).map(
    (layer) => ({
      layer,
      name: LAYER_NAME[layer],
      center: res.boards[layer].CENTER,
      sectors: COMPASS_DIRECTIONS.map((direction) => {
        const status = res.directions[direction][LAYER_FIELD[layer]];
        const [startDeg, endDeg] = sectorRange(direction, mapping);
        return {
          direction,
          label: DIRECTION_LABELS[direction],
          startDeg,
          endDeg,
          star: res.boards[layer][direction],
          status,
          statusLabel: statusLabelFor(status, layer),
          badge: statusBadgeFor(status, layer),
          kind: sectorKind(status),
        };
      }),
    }),
  );

  const columns: DirectionColumn[] = COMPASS_DIRECTIONS.map((direction) => {
    const d = res.directions[direction];
    const tier = isTier(d.tier) ? d.tier : null;
    const [startDeg, endDeg] = sectorRange(direction, mapping);
    return {
      direction,
      label: DIRECTION_LABELS[direction],
      startDeg,
      endDeg,
      tier,
      tierLabel: tier ? `${tier} ${TIER_JP[tier]}` : "判定なし",
      color: tier ? TIER_FILL[tier] : "#a8a29e",
      blocked: d.blocked,
      doyouSatsu: d.doyouSatsu,
      aligned: tier === "S",
    };
  });

  return { date: res.date, mapping, discs, columns };
}
