/**
 * 八宅の間取りの中身（立体と平面で共有）。**描くものは持たない。**
 *
 * 記事「風水（八宅）では、部屋の中のどこに何を置くとされるのか」の
 * 当て方を、本命卦の 8 方位（fengShuiEngine.readFengShui）で家の床に
 * 置いてみせる。**このサイトの判定ではない**（間取りのデータを持って
 * いない）。例として 1 通り置くだけ。
 *
 * 精度（利用者の依頼「精度は両方で」の判定の側）:
 * - 家の中心（太極）から見て 45 度ずつ（八宅の区分）。境目は
 *   directionAngleRange(physical)、区画の判定は directionFromBearing
 *   (physical)。**八方位に落とす実装を新しく書かない**（CLAUDE.md 3 節）
 * - 家具は**足元の四隅まで**その区画に収める。中心だけ区画に入っていても、
 *   はみ出した家具は「その区画に置いた」例にならない
 * - 向きは方位の中心の方位角。頭・顔・焚き口がその方位角を向く
 *
 * 座標: 床は正方形、中心が原点、北が −z・東が +x（三盤の方位盤と同じ）。
 */

import {
  COMPASS_DIRECTIONS,
  DIRECTION_BEARINGS,
  DIRECTION_LABELS,
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";
import { bearingOfPoint, sectorRange } from "@/lib/threeBoardModel";
import type { FengShuiReading, YouXing } from "@/utils/fengShuiEngine";

/** 床の半幅 */
export const ROOM_HALF = 6;

export interface RoomSector {
  direction: CompassDirection;
  label: string;
  youxing: YouXing;
  auspicious: boolean;
  meaning: string;
  startDeg: number;
  endDeg: number;
  /** 床の上の多角形（中心 → 境目 → 角 → 境目）。x, z */
  polygon: [number, number][];
}

export type RoomItemKind = "bed" | "desk" | "stove" | "bath";

export interface RoomItem {
  kind: RoomItemKind;
  name: string;
  /** 置いた区画 */
  sector: CompassDirection;
  sectorYouxing: YouXing;
  /** 頭・顔・焚き口が向く方位。水回りは向きを見ない */
  facing: CompassDirection | null;
  facingYouxing: YouXing | null;
  /** 中心 */
  x: number;
  z: number;
  /** 幅（左右）と奥行き（前後）。前が facing の向き */
  w: number;
  d: number;
  /** 前の向きの方位角（度） */
  facingDeg: number;
  /** 何の当て方の例か（記事の言い方） */
  rule: string;
}

export interface RoomModel {
  half: number;
  sectors: RoomSector[];
  items: RoomItem[];
}

const MAPPING = "physical" as const;

/** 方位角 b の向き（床の上の x, z。北が −z） */
export function unitOfBearing(b: number): [number, number] {
  const r = (b * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** 中心から方位角 b へ進んだとき、床の縁までの距離 */
export function distanceToEdge(b: number, half = ROOM_HALF): number {
  const [ux, uz] = unitOfBearing(b);
  const tx = Math.abs(ux) < 1e-12 ? Infinity : half / Math.abs(ux);
  const tz = Math.abs(uz) < 1e-12 ? Infinity : half / Math.abs(uz);
  return Math.min(tx, tz);
}

/** 区画の多角形。境目の線と床の縁の交点、そのあいだにある床の角 */
export function sectorPolygon(
  direction: CompassDirection,
  half = ROOM_HALF,
): [number, number][] {
  const [a, b] = sectorRange(direction, MAPPING);
  const at = (deg: number): [number, number] => {
    const [ux, uz] = unitOfBearing(deg);
    const t = distanceToEdge(deg, half);
    return [ux * t, uz * t];
  };
  const pts: [number, number][] = [[0, 0], at(a)];
  // 床の角の方位角は 45・135・225・315 度
  for (const corner of [45, 135, 225, 315, 405]) {
    if (corner > a && corner < b) pts.push(at(corner));
  }
  pts.push(at(b));
  return pts;
}

/** 床の上の点の区画（判定と同じ境目） */
export function sectorOfPoint(x: number, z: number): CompassDirection {
  return directionFromBearing(bearingOfPoint(x, z), MAPPING);
}

/** 家具の足元の四隅 */
export function itemCorners(
  item: Pick<RoomItem, "x" | "z" | "w" | "d" | "facingDeg">,
): [number, number][] {
  const [fx, fz] = unitOfBearing(item.facingDeg);
  // 右手（前から時計回りに 90 度）
  const [rx, rz] = unitOfBearing(item.facingDeg + 90);
  const out: [number, number][] = [];
  for (const sf of [1, -1]) {
    for (const sr of [1, -1]) {
      out.push([
        item.x + (fx * item.d * sf) / 2 + (rx * item.w * sr) / 2,
        item.z + (fz * item.d * sf) / 2 + (rz * item.w * sr) / 2,
      ]);
    }
  }
  return out;
}

/** 境目からこれだけ離す（度）。境目の上に置くと、どちらの区画か読めない */
export const EDGE_MARGIN_DEG = 2;
/** 壁からこれだけ離す */
const WALL_MARGIN = 0.15;

/** 点が区画の中にあり、境目からも壁からも離れているか */
export function pointWellInside(
  x: number,
  z: number,
  direction: CompassDirection,
  half = ROOM_HALF,
): boolean {
  if (Math.abs(x) > half - WALL_MARGIN || Math.abs(z) > half - WALL_MARGIN)
    return false;
  if (sectorOfPoint(x, z) !== direction) return false;
  const [a, b] = sectorRange(direction, MAPPING);
  let p = bearingOfPoint(x, z);
  if (p < a) p += 360;
  return p - a >= EDGE_MARGIN_DEG && b - p >= EDGE_MARGIN_DEG;
}

/**
 * 家具を区画の中ほどに置く。方位の中心線の上で、四隅がすべて区画に
 * 収まる距離を探す（中ほどから近い順）。収まらなければ null。
 */
export function placeInSector(
  direction: CompassDirection,
  size: { w: number; d: number },
  facingDeg: number,
  half = ROOM_HALF,
): { x: number; z: number } | null {
  const mid = DIRECTION_BEARINGS[direction];
  const [ux, uz] = unitOfBearing(mid);
  const edge = distanceToEdge(mid, half);
  const tries: number[] = [];
  for (let k = 0; k <= 80; k++) {
    const off = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.01;
    const f = 0.64 + off;
    if (f > 0.2 && f < 0.97) tries.push(f);
  }
  for (const f of tries) {
    const x = ux * edge * f;
    const z = uz * edge * f;
    const corners = itemCorners({ x, z, ...size, facingDeg });
    if (corners.every(([cx, cz]) => pointWellInside(cx, cz, direction, half)))
      return { x, z };
  }
  return null;
}

interface ItemSpec {
  kind: RoomItemKind;
  name: string;
  w: number;
  d: number;
  /** どの遊星の区画に置くか */
  place: YouXing;
  /** どの遊星の方位を向くか（向きを見ないものは null） */
  face: YouXing | null;
  rule: string;
}

/**
 * 記事の「よく挙げられる当て方」。どの吉・凶を選ぶかは流派で違うので、
 * 例として 1 つに決めて、画面にもそう書く。
 */
export const ROOM_ITEM_SPECS: readonly ItemSpec[] = [
  {
    kind: "bed",
    name: "ベッド",
    w: 1.4,
    d: 2.0,
    place: "延年",
    face: "天医",
    rule: "寝室は吉の区画に置き、頭を吉の方位（ここでは天医）へ向ける",
  },
  {
    kind: "desk",
    name: "机",
    w: 1.3,
    d: 1.1,
    place: "生気",
    face: "生気",
    rule: "机は吉の区画に置き、座ったときの顔を生気へ向ける",
  },
  {
    kind: "stove",
    name: "コンロ",
    w: 1.2,
    d: 0.7,
    place: "絶命",
    face: "天医",
    rule: "コンロは凶の区画に置き、焚き口を吉の方位へ向ける（坐凶向吉）",
  },
  {
    kind: "bath",
    name: "トイレ・浴室",
    w: 1.4,
    d: 1.4,
    place: "五鬼",
    face: null,
    rule: "トイレや浴室などの水回りは凶の区画に置く",
  },
];

export function buildRoomModel(
  reading: FengShuiReading,
  half = ROOM_HALF,
): RoomModel {
  const byYouxing = new Map(reading.directions.map((d) => [d.youxing, d]));
  const sectors: RoomSector[] = COMPASS_DIRECTIONS.map((direction) => {
    const d = reading.directions.find((x) => x.direction === direction)!;
    const [startDeg, endDeg] = sectorRange(direction, MAPPING);
    return {
      direction,
      label: DIRECTION_LABELS[direction],
      youxing: d.youxing,
      auspicious: d.auspicious,
      meaning: d.meaning,
      startDeg,
      endDeg,
      polygon: sectorPolygon(direction, half),
    };
  });
  const items: RoomItem[] = [];
  for (const spec of ROOM_ITEM_SPECS) {
    const at = byYouxing.get(spec.place)!;
    const toward = spec.face ? byYouxing.get(spec.face)! : null;
    /* 向きを見ないもの（水回り）は、置いた区画の中心へ向けておく
       （四角が区画の形に沿う） */
    const facingDeg = DIRECTION_BEARINGS[toward?.direction ?? at.direction];
    const pos = placeInSector(at.direction, spec, facingDeg, half);
    /* 8 卦 × 4 品ですべて収まることをテストで固定してある。ここに来たら
       寸法か当て方を変えたときの取りこぼし */
    if (!pos) throw new Error(`${spec.name}が${at.direction}に収まらない`);
    items.push({
      kind: spec.kind,
      name: spec.name,
      sector: at.direction,
      sectorYouxing: at.youxing,
      facing: toward?.direction ?? null,
      facingYouxing: toward?.youxing ?? null,
      x: pos.x,
      z: pos.z,
      w: spec.w,
      d: spec.d,
      facingDeg,
      rule: spec.rule,
    });
  }
  return { half, sectors, items };
}
