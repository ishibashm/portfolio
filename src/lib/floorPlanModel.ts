/**
 * 利用者が描いた間取りに、八宅の 8 区画を当てる中身。**描くものは持たない。**
 *
 * 記事「風水（八宅）では、部屋の中のどこに何を置くとされるのか」の
 * 当て方を、例の部屋（fengShuiRoomModel）ではなく**自分の間取り**で
 * 見るためのもの。部屋は四角の組み合わせで描いてもらう（間取り図の
 * 画像から自動で部屋を読み取ることはしない）。
 *
 * 精度:
 * - 家の中心（太極）は、描いた部屋を合わせた形の**面積の重心**。
 *   重なりは 1 回だけ数える（座標を区切って升ごとに足すので厳密）。
 *   欠けを補った四角形の中心で取る説明もあるので、そちらも選べる
 * - 区画は 45 度ずつ（八宅の区分）。境目は sectorRange(physical)、
 *   点の区画は directionFromBearing(physical)。**八方位に落とす実装を
 *   新しく書かない**（CLAUDE.md 3 節）
 * - 部屋が各区画に占める面積は、部屋の四角を区画の扇で**切り取って**
 *   測る（升目で数えない）。足すと部屋の面積に戻る
 * - 方位記号の向きは利用者が合わせる。間取り図の方位記号は真北とは
 *   限らない（磁北のことも、おおよそのこともある）ので、**記号が
 *   10 度ずれると主な区画が変わる部屋**を拾って知らせる
 *
 * 寸法の単位は持たない。区画は角度だけで決まるので、縦横の比が
 * 合っていれば、m でも升目でも答えは同じ。
 *
 * 座標: 間取りの図のまま。x が右、y が下。図の上を向いた向きから
 * 時計回りに測った角度を「図の角度」と呼ぶ。方位記号が図の角度
 * northArrowDeg を指しているとき、図の角度 θ の向きの方位角は
 * θ − northArrowDeg。
 */

import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  directionFromBearing,
  normalizeBearing,
  type CompassDirection,
} from "@/utils/directionGeo";
import { sectorRange } from "@/lib/threeBoardModel";
import type { FengShuiReading, YouXing } from "@/utils/fengShuiEngine";

const MAPPING = "physical" as const;

export type PlanRoomKind =
  | "entrance"
  | "bedroom"
  | "study"
  | "living"
  | "kitchen"
  | "toilet"
  | "bath"
  | "other";

export const ROOM_KIND_LABELS: Record<PlanRoomKind, string> = {
  entrance: "玄関",
  bedroom: "寝室",
  study: "書斎・勉強部屋",
  living: "居間",
  kitchen: "台所（コンロ）",
  toilet: "トイレ",
  bath: "浴室・洗面",
  other: "その他",
};

/**
 * 記事で紹介した、よく挙げられる当て方。居間・その他は記事に当て方が
 * 無いので、合う・合わないを出さない。
 */
export const ROOM_KIND_RULES: Record<
  PlanRoomKind,
  { want: "auspicious" | "inauspicious"; text: string } | null
> = {
  entrance: {
    want: "auspicious",
    text: "玄関は吉の区画（なかでも生気）にあるのが望ましいとされる",
  },
  bedroom: { want: "auspicious", text: "寝室は吉の区画に置くとされる" },
  study: { want: "auspicious", text: "机を置く部屋も吉の区画がよいとされる" },
  living: null,
  kitchen: {
    want: "inauspicious",
    text: "コンロは凶の区画に置き、焚き口を吉へ向けるとされる（坐凶向吉）",
  },
  toilet: {
    want: "inauspicious",
    text: "水回りは凶の区画にあるほうがよいとされる",
  },
  bath: {
    want: "inauspicious",
    text: "水回りは凶の区画にあるほうがよいとされる",
  },
  other: null,
};

export interface PlanRoom {
  id: string;
  kind: PlanRoomKind;
  name: string;
  /** 左上の角と幅・高さ（図の座標） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CenterMethod = "centroid" | "bbox";

export interface FloorPlanInput {
  rooms: PlanRoom[];
  /** 方位記号（北）が指す図の角度。図の上が北なら 0、右が北なら 90 */
  northArrowDeg: number;
  centerMethod: CenterMethod;
}

export type Point = [number, number];

/** 方位記号がこれだけずれると主な区画が変わる部屋を拾う（度） */
export const SENSITIVITY_DEG = 10;

/** 図の角度 θ の向き（長さ 1）。上が −y */
export function unitOfPlanAngle(deg: number): Point {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** 中心から見た点の方位角（真北から時計回り） */
export function bearingOfPlanPoint(
  p: Point,
  center: Point,
  northArrowDeg: number,
): number {
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  const planDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return normalizeBearing(planDeg - northArrowDeg);
}

/** 方位角 b の向きの図の角度 */
export function planAngleOfBearing(b: number, northArrowDeg: number): number {
  return normalizeBearing(b + northArrowDeg);
}

/** 多角形の面積（向きを問わない） */
export function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** 部屋の四隅（図の上で時計回り） */
export function roomPolygon(r: Pick<PlanRoom, "x" | "y" | "w" | "h">): Point[] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

/**
 * 中心 c を通り向き u の直線で多角形を切り、u から時計回りの側
 * （cross(u, p − c) ≥ 0）を残す（Sutherland–Hodgman）。
 */
function clipHalfPlane(poly: Point[], c: Point, u: Point, keepCw: boolean) {
  const side = (p: Point) => {
    const v = u[0] * (p[1] - c[1]) - u[1] * (p[0] - c[0]);
    return keepCw ? v : -v;
  };
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * 多角形のうち、中心から見て図の角度 [start, end] の扇に入る部分。
 * 扇は 180 度未満（八宅は 45 度）なので、2 本の直線の内側で表せる。
 */
export function clipToWedge(
  poly: Point[],
  center: Point,
  startPlanDeg: number,
  endPlanDeg: number,
): Point[] {
  const a = clipHalfPlane(poly, center, unitOfPlanAngle(startPlanDeg), true);
  if (a.length < 3) return [];
  const b = clipHalfPlane(a, center, unitOfPlanAngle(endPlanDeg), false);
  return b.length < 3 ? [] : b;
}

export interface PlanUnion {
  /** 重なりを 1 回だけ数えた面積 */
  area: number;
  /** 面積の重心 */
  centroid: Point;
  /** 外接する四角形 */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * 部屋を合わせた形。座標を区切った升ごとに「どれかの部屋に入るか」を
 * 見て足す。四角の和なので、これで面積も重心も厳密になる。
 */
export function planUnion(rooms: PlanRoom[]): PlanUnion | null {
  const rs = rooms.filter((r) => r.w > 0 && r.h > 0);
  if (rs.length === 0) return null;
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(rs.flatMap((r) => [r.y, r.y + r.h]))].sort(
    (a, b) => a - b,
  );
  let area = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j + 1 < ys.length; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2;
      const inside = rs.some(
        (r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h,
      );
      if (!inside) continue;
      const a = (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      area += a;
      mx += a * cx;
      my += a * cy;
    }
  }
  return {
    area,
    centroid: [mx / area, my / area],
    bbox: {
      minX: xs[0],
      minY: ys[0],
      maxX: xs[xs.length - 1],
      maxY: ys[ys.length - 1],
    },
  };
}

export function planCenter(u: PlanUnion, method: CenterMethod): Point {
  if (method === "centroid") return u.centroid;
  return [(u.bbox.minX + u.bbox.maxX) / 2, (u.bbox.minY + u.bbox.maxY) / 2];
}

export interface PlanSector {
  direction: CompassDirection;
  label: string;
  youxing: YouXing;
  auspicious: boolean;
  /** 方位角の境目（北は 337.5〜382.5 のように開く） */
  startDeg: number;
  endDeg: number;
  /** 図の角度の境目 */
  startPlanDeg: number;
  endPlanDeg: number;
}

export interface RoomShare {
  direction: CompassDirection;
  youxing: YouXing;
  auspicious: boolean;
  area: number;
  /** 部屋の面積に対する割合（0〜1） */
  share: number;
  /** 部屋のうち、この区画に入る部分（図の座標） */
  piece: Point[];
}

export type RoomFit = "match" | "mismatch" | "none";

export interface PlanRoomResult {
  room: PlanRoom;
  area: number;
  /** 面積の大きい順。0 の区画は入れない */
  shares: RoomShare[];
  /** いちばん広く占める区画 */
  main: RoomShare;
  fit: RoomFit;
  rule: string | null;
  /** 太極がこの部屋の中にある（区画が中心で集まる） */
  containsCenter: boolean;
  /** 方位記号が ±SENSITIVITY_DEG ずれると、主な区画が変わる */
  sensitive: boolean;
  /** もう一方の中心の取り方で、主な区画が変わる */
  centerDependent: boolean;
}

export interface FloorPlanResult {
  union: PlanUnion;
  center: Point;
  /** もう一方の取り方の中心 */
  otherCenter: Point;
  sectors: PlanSector[];
  rooms: PlanRoomResult[];
  /** 重なっている部屋の組（重なりは面積を 1 回だけ数えている） */
  overlaps: [string, string][];
}

function planSectors(
  reading: FengShuiReading,
  northArrowDeg: number,
): PlanSector[] {
  return COMPASS_DIRECTIONS.map((direction) => {
    const d = reading.directions.find((x) => x.direction === direction)!;
    const [startDeg, endDeg] = sectorRange(direction, MAPPING);
    return {
      direction,
      label: DIRECTION_LABELS[direction],
      youxing: d.youxing,
      auspicious: d.auspicious,
      startDeg,
      endDeg,
      startPlanDeg: startDeg + northArrowDeg,
      endPlanDeg: endDeg + northArrowDeg,
    };
  });
}

/** 部屋を 8 区画で切り分ける。面積の大きい順 */
export function roomShares(
  room: PlanRoom,
  center: Point,
  sectors: PlanSector[],
): RoomShare[] {
  const poly = roomPolygon(room);
  const total = room.w * room.h;
  const out: RoomShare[] = [];
  for (const s of sectors) {
    const piece = clipToWedge(poly, center, s.startPlanDeg, s.endPlanDeg);
    const area = piece.length ? polygonArea(piece) : 0;
    if (area <= total * 1e-9) continue;
    out.push({
      direction: s.direction,
      youxing: s.youxing,
      auspicious: s.auspicious,
      area,
      share: area / total,
      piece,
    });
  }
  return out.sort((a, b) => b.area - a.area);
}

function mainDirection(
  room: PlanRoom,
  center: Point,
  reading: FengShuiReading,
  northArrowDeg: number,
): CompassDirection {
  return roomShares(room, center, planSectors(reading, northArrowDeg))[0]
    .direction;
}

function rectsOverlap(a: PlanRoom, b: PlanRoom): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1e-9 && h > 1e-9;
}

export function buildFloorPlan(
  input: FloorPlanInput,
  reading: FengShuiReading,
): FloorPlanResult | null {
  const rooms = input.rooms.filter((r) => r.w > 0 && r.h > 0);
  const union = planUnion(rooms);
  if (!union) return null;
  const north = input.northArrowDeg;
  const center = planCenter(union, input.centerMethod);
  const otherCenter = planCenter(
    union,
    input.centerMethod === "centroid" ? "bbox" : "centroid",
  );
  const sectors = planSectors(reading, north);

  const results: PlanRoomResult[] = rooms.map((room) => {
    const shares = roomShares(room, center, sectors);
    const main = shares[0];
    const rule = ROOM_KIND_RULES[room.kind];
    const fit: RoomFit = !rule
      ? "none"
      : main.auspicious === (rule.want === "auspicious")
        ? "match"
        : "mismatch";
    let sensitive = false;
    for (let d = -SENSITIVITY_DEG; d <= SENSITIVITY_DEG && !sensitive; d++) {
      if (d === 0) continue;
      if (mainDirection(room, center, reading, north + d) !== main.direction)
        sensitive = true;
    }
    return {
      room,
      area: room.w * room.h,
      shares,
      main,
      fit,
      rule: rule?.text ?? null,
      containsCenter:
        center[0] > room.x &&
        center[0] < room.x + room.w &&
        center[1] > room.y &&
        center[1] < room.y + room.h,
      sensitive,
      centerDependent:
        mainDirection(room, otherCenter, reading, north) !== main.direction,
    };
  });

  const overlaps: [string, string][] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsOverlap(rooms[i], rooms[j]))
        overlaps.push([rooms[i].id, rooms[j].id]);
    }
  }

  return { union, center, otherCenter, sectors, rooms: results, overlaps };
}

/** 点の区画（判定と同じ境目）。図の上で押した所の区画を出すのに使う */
export function sectorOfPlanPoint(
  p: Point,
  center: Point,
  northArrowDeg: number,
): CompassDirection {
  return directionFromBearing(
    bearingOfPlanPoint(p, center, northArrowDeg),
    MAPPING,
  );
}

/**
 * 例の間取り（2LDK ほど。横 9・縦 7.2 の長方形）。図の上が北。
 * 何も描いていない人にも結果が見えるように置く。
 */
export const EXAMPLE_ROOMS: readonly PlanRoom[] = [
  { id: "ex-ldk", kind: "living", name: "LD", x: 0, y: 0, w: 5.4, h: 4.5 },
  {
    id: "ex-kit",
    kind: "kitchen",
    name: "キッチン",
    x: 5.4,
    y: 0,
    w: 1.8,
    h: 3.6,
  },
  { id: "ex-bath", kind: "bath", name: "浴室", x: 7.2, y: 0, w: 1.8, h: 1.8 },
  { id: "ex-wash", kind: "bath", name: "洗面", x: 7.2, y: 1.8, w: 1.8, h: 1.8 },
  {
    id: "ex-hall",
    kind: "other",
    name: "廊下",
    x: 5.4,
    y: 3.6,
    w: 3.6,
    h: 0.9,
  },
  { id: "ex-bed", kind: "bedroom", name: "寝室", x: 0, y: 4.5, w: 3.6, h: 2.7 },
  {
    id: "ex-study",
    kind: "study",
    name: "洋室",
    x: 3.6,
    y: 4.5,
    w: 2.7,
    h: 2.7,
  },
  {
    id: "ex-wc",
    kind: "toilet",
    name: "トイレ",
    x: 6.3,
    y: 4.5,
    w: 0.9,
    h: 1.8,
  },
  { id: "ex-cl", kind: "other", name: "収納", x: 6.3, y: 6.3, w: 0.9, h: 0.9 },
  {
    id: "ex-ent",
    kind: "entrance",
    name: "玄関",
    x: 7.2,
    y: 4.5,
    w: 1.8,
    h: 2.7,
  },
];
