"use client";

/**
 * 自分の間取りの立体（three.js）。**描くだけ。**太極・区画・部屋の欠片は
 * floorPlanModel が出したものを写す。
 *
 * - 床: 描いた部屋の外側まで一回り広い台に、部屋ごとの欠片を吉（緑）・
 *   凶（赤）で塗る。区画の境目を太極から台の縁まで引き、縁に方位と遊星
 * - 壁: 部屋の縁に腰の高さの壁（中が見えるように低く）。選んだ部屋は
 *   壁を琥珀色にする
 * - 方位記号: 台の外に金の矢印。図の上で記号が指す向き（＝真北として
 *   扱う向き）を指す
 * - 床を押すと、その点を含む部屋を選ぶ
 *
 * 座標: 図の x がそのまま x、図の y（下向き）が z。太極が原点。図の上が
 * −z なので、記号が図の上を指していれば北は −z（三盤の方位盤と同じ）。
 */

import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from "three";
import { createStage } from "@/lib/threeStage";
import {
  ROOM_KIND_LABELS,
  type FloorPlanResult,
  type PlanRoom,
  type Point,
} from "@/lib/floorPlanModel";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

const TEX = 2048;
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
const WALL_H = 0.5;
const WALL_T = 0.1;
const PLATE_T = 0.3;
/** 部屋の外側に足す台の幅（区画の名前を書く所） */
const MARGIN = 2;

export interface FloorPlanSceneProps {
  result: FloorPlanResult;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
}

/** 台（床の絵）の範囲。図の座標 */
export function plateBounds(result: FloorPlanResult) {
  const b = result.union.bbox;
  return {
    minX: b.minX - MARGIN,
    minY: b.minY - MARGIN,
    maxX: b.maxX + MARGIN,
    maxY: b.maxY + MARGIN,
  };
}

/** 図の点 → 立体の床の点（x, z）。太極が原点 */
export function planToWorld(p: Point, center: Point): [number, number] {
  return [p[0] - center[0], p[1] - center[1]];
}

/** 立体の床の点 → 図の点 */
export function worldToPlan(x: number, z: number, center: Point): Point {
  return [x + center[0], z + center[1]];
}

/** 図の点を含む部屋（後に描いたものが上）。無ければ null */
export function roomAtPlanPoint(rooms: PlanRoom[], p: Point): PlanRoom | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h)
      return r;
  }
  return null;
}

/** 中心から図の角度 deg の向きに進んで、範囲の縁に当たるまでの長さ */
function rayLength(
  c: Point,
  deg: number,
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const r = (deg * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const ts: number[] = [];
  if (ux > 1e-9) ts.push((b.maxX - c[0]) / ux);
  if (ux < -1e-9) ts.push((b.minX - c[0]) / ux);
  if (uy > 1e-9) ts.push((b.maxY - c[1]) / uy);
  if (uy < -1e-9) ts.push((b.minY - c[1]) / uy);
  return Math.max(0, Math.min(...ts));
}

/**
 * 方位記号の矢印の置き場所と向き。北の区画の真ん中の図の角度へ、台の縁の
 * 少し外に置く。前（局所の −z）がその向きを指すよう y 軸まわりに回す。
 */
export function northArrowPlacement(result: FloorPlanResult): {
  x: number;
  z: number;
  rotationY: number;
  planDeg: number;
} {
  const n = result.sectors.find((s) => s.direction === "N")!;
  const planDeg = (n.startPlanDeg + n.endPlanDeg) / 2;
  const a = (planDeg * Math.PI) / 180;
  const reach = rayLength(result.center, planDeg, plateBounds(result)) + 0.6;
  return {
    x: Math.sin(a) * reach,
    z: -Math.cos(a) * reach,
    rotationY: -a,
    planDeg,
  };
}

/** 床の絵。板目・部屋の欠片・境目・名前・太極 */
function paintFloor(result: FloorPlanResult): {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
} {
  const b = plateBounds(result);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const s = TEX / Math.max(w, h);
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const g = c.getContext("2d")!;
  const X = (x: number) => (x - b.minX) * s;
  const Y = (y: number) => (y - b.minY) * s;

  // 台（家の外）は石畳のような灰色
  g.fillStyle = "#d6d3d1";
  g.fillRect(0, 0, c.width, c.height);

  // 部屋の床（板目）と欠片の色
  for (const rr of result.rooms) {
    const r = rr.room;
    const plank = 0.3 * s;
    for (let i = 0; i * plank < r.h * s; i++) {
      const shade = 0.9 + ((i * 37 + r.id.length * 13) % 11) / 100;
      g.fillStyle = `rgb(${Math.round(214 * shade)},${Math.round(184 * shade)},${Math.round(146 * shade)})`;
      g.fillRect(
        X(r.x),
        Y(r.y) + i * plank,
        r.w * s,
        Math.min(plank, r.h * s - i * plank),
      );
    }
    for (const sh of rr.shares) {
      g.beginPath();
      sh.piece.forEach(([x, y], i) =>
        i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y)),
      );
      g.closePath();
      g.fillStyle = sh.auspicious
        ? "rgba(16,185,129,0.55)"
        : "rgba(225,29,72,0.48)";
      g.fill();
    }
  }

  // 境目（太極から台の縁まで）
  const ctr = result.center;
  g.strokeStyle = "rgba(41,24,12,0.85)";
  g.lineWidth = Math.max(4, 0.05 * s);
  g.setLineDash([0.22 * s, 0.14 * s]);
  for (const sec of result.sectors) {
    const t = rayLength(ctr, sec.startPlanDeg, b);
    const a = (sec.startPlanDeg * Math.PI) / 180;
    g.beginPath();
    g.moveTo(X(ctr[0]), Y(ctr[1]));
    g.lineTo(X(ctr[0] + Math.sin(a) * t), Y(ctr[1] - Math.cos(a) * t));
    g.stroke();
  }
  g.setLineDash([]);

  g.textAlign = "center";
  g.textBaseline = "middle";

  // 区画の名前（台の縁の近く）
  for (const sec of result.sectors) {
    const mid = (sec.startPlanDeg + sec.endPlanDeg) / 2;
    const a = (mid * Math.PI) / 180;
    const t = rayLength(ctr, mid, b) - MARGIN / 2;
    const x = X(ctr[0] + Math.sin(a) * t);
    const y = Y(ctr[1] - Math.cos(a) * t);
    const bw = 1.9 * s;
    const bh = 0.82 * s;
    g.fillStyle = "rgba(255,251,235,0.95)";
    g.beginPath();
    g.roundRect(x - bw / 2, y - bh / 2, bw, bh, 0.12 * s);
    g.fill();
    g.strokeStyle = sec.auspicious ? "#059669" : "#e11d48";
    g.lineWidth = 0.04 * s;
    g.stroke();
    g.fillStyle = sec.auspicious ? "#065f46" : "#9f1239";
    g.font = `800 ${0.34 * s}px ${FONT}`;
    g.fillText(
      `${sec.label}・${sec.auspicious ? "吉" : "凶"}`,
      x,
      y - 0.12 * s,
    );
    g.font = `700 ${0.28 * s}px ${FONT}`;
    g.fillStyle = "#292524";
    g.fillText(sec.youxing, x, y + 0.2 * s);
  }

  // 部屋の名前と主な区画
  for (const rr of result.rooms) {
    const r = rr.room;
    const fs = Math.min(0.34, r.w / 5.6, r.h / 2.6) * s;
    const cx = X(r.x + r.w / 2);
    const cy = Y(r.y + r.h / 2);
    g.font = `800 ${fs}px ${FONT}`;
    g.fillStyle = "#1c1917";
    g.fillText(r.name || ROOM_KIND_LABELS[r.kind], cx, cy - fs * 0.6);
    g.font = `700 ${fs * 0.85}px ${FONT}`;
    g.fillStyle = rr.main.auspicious ? "#065f46" : "#9f1239";
    g.fillText(
      `${DIRECTION_LABELS[rr.main.direction]}・${rr.main.youxing}`,
      cx,
      cy + fs * 0.6,
    );
  }

  // 太極
  g.fillStyle = "#1c1917";
  g.beginPath();
  g.arc(X(ctr[0]), Y(ctr[1]), 0.22 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fef3c7";
  g.font = `800 ${0.15 * s}px ${FONT}`;
  g.fillText("太極", X(ctr[0]), Y(ctr[1]));
  return { canvas: c, w, h };
}

export default function FloorPlanScene({
  result,
  selectedId,
  onSelect,
  reducedMotion,
}: FloorPlanSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef(result);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const motionRef = useRef(reducedMotion);
  const apiRef = useRef<{
    rebuild: (r: FloorPlanResult) => void;
    select: (id: string | null) => void;
  } | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = createStage(host, {
      fov: 34,
      camera: [0, 12, 13],
      target: [0, 0, 0.4],
      minDistance: 8,
      maxDistance: 40,
      maxPolarAngle: 1.25,
      autoRotate: !motionRef.current,
      autoRotateSpeed: 0.3,
      sunOffset: [7, 16, 9],
      shadowExtent: 10,
    });
    const { scene, pool } = stage;
    const world = new Group();
    scene.add(world);

    let floor: Mesh | null = null;
    let current = resultRef.current;
    const wallsById = new Map<string, Mesh[]>();
    let wallMat: MeshStandardMaterial | null = null;
    let wallSelMat: MeshStandardMaterial | null = null;

    function rebuild(r: FloorPlanResult) {
      current = r;
      world.clear();
      pool.clear();
      wallsById.clear();
      const ctr = r.center;
      const b = plateBounds(r);
      const [x0, z0] = planToWorld([b.minX, b.minY], ctr);
      const [x1, z1] = planToWorld([b.maxX, b.maxY], ctr);
      const w = x1 - x0;
      const d = z1 - z0;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;

      // 台
      const plate = new Mesh(
        pool.keep(new BoxGeometry(w, PLATE_T, d)),
        pool.keep(
          new MeshStandardMaterial({ color: 0x57534e, roughness: 0.8 }),
        ),
      );
      plate.position.set(mx, -PLATE_T / 2, mz);
      plate.receiveShadow = true;
      world.add(plate);

      const painted = paintFloor(r);
      floor = new Mesh(
        pool.keep(new PlaneGeometry(w, d)),
        pool.keep(
          new MeshStandardMaterial({
            map: pool.texture(painted.canvas),
            roughness: 0.65,
            metalness: 0,
            envMapIntensity: 0.4,
          }),
        ),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(mx, 0.002, mz);
      floor.receiveShadow = true;
      world.add(floor);

      // 壁（部屋の縁の内側に、腰の高さで）
      wallMat = pool.keep(
        new MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 }),
      );
      wallSelMat = pool.keep(
        new MeshStandardMaterial({
          color: 0xfbbf24,
          roughness: 0.6,
          emissive: new Color(0x7c4a03),
          emissiveIntensity: 0.4,
        }),
      );
      for (const rr of r.rooms) {
        const room = rr.room;
        const [rx, rz] = planToWorld([room.x, room.y], ctr);
        const t = WALL_T;
        const segs: [number, number, number, number][] = [
          [rx + room.w / 2, rz + t / 2, room.w, t],
          [rx + room.w / 2, rz + room.h - t / 2, room.w, t],
          [rx + t / 2, rz + room.h / 2, t, room.h],
          [rx + room.w - t / 2, rz + room.h / 2, t, room.h],
        ];
        const meshes: Mesh[] = [];
        for (const [cx, cz, sw, sd] of segs) {
          const m = new Mesh(
            pool.keep(new BoxGeometry(sw, WALL_H, sd)),
            wallMat,
          );
          m.position.set(cx, WALL_H / 2, cz);
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.roomId = room.id;
          world.add(m);
          meshes.push(m);
        }
        wallsById.set(room.id, meshes);
      }

      // 方位記号（台の外に金の矢印。記号が指す図の角度を向く）
      const gold = pool.keep(
        new MeshStandardMaterial({
          color: 0xd4a017,
          metalness: 0.6,
          roughness: 0.3,
          emissive: new Color(0x5a3d00),
        }),
      );
      const place = northArrowPlacement(r);
      const arrow = new Group();
      const shaft = new Mesh(pool.keep(new BoxGeometry(0.16, 0.08, 1.2)), gold);
      shaft.position.set(0, 0.1, 0.2);
      const head = new Mesh(pool.keep(new ConeGeometry(0.34, 0.6, 4)), gold);
      head.rotation.x = -Math.PI / 2;
      head.position.set(0, 0.1, -0.7);
      arrow.add(shaft, head);
      arrow.position.set(place.x, 0, place.z);
      arrow.rotation.y = place.rotationY;
      world.add(arrow);

      select(selectedRef.current);
    }

    function select(id: string | null) {
      selectedRef.current = id;
      for (const [rid, meshes] of wallsById) {
        for (const m of meshes) {
          m.material = rid === id ? wallSelMat! : wallMat!;
          m.position.y = rid === id ? WALL_H / 2 + 0.02 : WALL_H / 2;
        }
      }
    }

    apiRef.current = { rebuild, select };
    rebuild(resultRef.current);

    // 壁か床を押したら、その点を含む部屋（無ければ選びを外す）
    stage.onPick(
      () => [...wallsById.values()].flat(),
      (hit) => {
        const o: Object3D = hit.object;
        onSelectRef.current(o.userData.roomId ?? null);
      },
    );
    stage.onPick(
      () => (floor ? [floor] : []),
      (hit) => {
        const p = worldToPlan(hit.point.x, hit.point.z, current.center);
        const room = roomAtPlanPoint(
          current.rooms.map((r) => r.room),
          p,
        );
        onSelectRef.current(room?.id ?? null);
      },
    );
    return () => {
      stage.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    resultRef.current = result;
    apiRef.current?.rebuild(result);
  }, [result]);
  useEffect(() => {
    apiRef.current?.select(selectedId);
  }, [selectedId]);

  return (
    <div
      ref={hostRef}
      className="h-[460px] w-full cursor-pointer md:h-[600px]"
      role="img"
      aria-label="描いた間取りの模型。部屋の床に八宅の区画の吉凶を塗ってある。部屋を押すと選べます"
    />
  );
}
