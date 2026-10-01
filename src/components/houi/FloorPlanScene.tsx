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
 * - パース: 壁を 1.2 m で切った高さまで立て、部屋の種類ごとに家具・設備を
 *   置く（fixturesForRoom）。1 マスを 1 m とみなした目安の大きさで、
 *   部屋の内側に必ず収める
 * - 書き出し: 立体を .glb にして返す（exportRef）。**端末の中で作る
 *   だけで、どこにも送らない**
 *
 * 座標: 図の x がそのまま x、図の y（下向き）が z。太極が原点。図の上が
 * −z なので、記号が図の上を指していれば北は −z（三盤の方位盤と同じ）。
 */

import { useEffect, useRef, type MutableRefObject } from "react";
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
/**
 * パースの壁の高さ。天井（2.4 m）まで立てると、斜め上から見たときに
 * 手前の壁が奥の部屋を隠す。鳥瞰パースの定番どおり 1.2 m で切る
 */
const WALL_H_FULL = 1.2;
const WALL_T = 0.1;
const PLATE_T = 0.3;
/** 部屋の外側に足す台の幅（区画の名前を書く所） */
const MARGIN = 2;

export interface FloorPlanSceneProps {
  result: FloorPlanResult;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
  /** 壁を高くして（1.2 m で切る）、家具を置く */
  perspective?: boolean;
  /** 書き出しの口。立体を .glb にして返す関数をここに入れる */
  exportRef?: MutableRefObject<(() => Promise<Blob>) | null>;
}

/** 家具・設備の箱（図の座標。1 マス = 1 m とみなす） */
export interface Fixture {
  kind: string;
  x: number;
  y: number;
  w: number;
  d: number;
  /** 床からの高さの下端と上端 */
  z0: number;
  z1: number;
  color: number;
}

/** 壁から離す */
const INSET = 0.08;

/**
 * 部屋の種類ごとの家具・設備。大きさは実寸の目安（m）を、部屋に収まる
 * ように縮める。**部屋の外には出さない**（テストで固定）。居間・その他は
 * 種類から置くものが決まらないので、居間にソファだけ置く。
 */
export function fixturesForRoom(room: PlanRoom): Fixture[] {
  const ix = room.x + INSET;
  const iy = room.y + INSET;
  const iw = room.w - 2 * INSET;
  const ih = room.h - 2 * INSET;
  if (iw < 0.3 || ih < 0.3) return [];
  const out: Fixture[] = [];
  const add = (
    kind: string,
    x: number,
    y: number,
    w: number,
    d: number,
    z0: number,
    z1: number,
    color: number,
  ) => {
    if (w >= 0.15 && d >= 0.15) out.push({ kind, x, y, w, d, z0, z1, color });
  };
  const long = iw >= ih;
  switch (room.kind) {
    case "bedroom": {
      // ベッドは長い向きを部屋の長い辺にそろえ、左上の角に寄せる
      const bw = Math.min(1.0, (long ? ih : iw) * 0.7);
      const bl = Math.min(2.0, (long ? iw : ih) * 0.85);
      const [w, d] = long ? [bl, bw] : [bw, bl];
      add("bed", ix, iy, w, d, 0, 0.45, 0xa16207);
      add(
        "bedding",
        ix + 0.03,
        iy + 0.03,
        w - 0.06,
        d - 0.06,
        0.45,
        0.55,
        0xe2e8f0,
      );
      break;
    }
    case "study": {
      const w = Math.min(1.2, iw * 0.8);
      const d = Math.min(0.6, ih * 0.4);
      const x = ix + (iw - w) / 2;
      add("desk", x, iy, w, d, 0.68, 0.72, 0xa16207);
      const c = Math.min(0.45, ih - d - 0.05);
      add("chair", x + (w - c) / 2, iy + d + 0.05, c, c, 0, 0.45, 0x334155);
      break;
    }
    case "kitchen": {
      // 長い辺に沿ってカウンター。左にシンク、右にコンロ
      const [w, d] = long
        ? [iw, Math.min(0.65, ih * 0.6)]
        : [Math.min(0.65, iw * 0.6), ih];
      add("counter", ix, iy, w, d, 0, 0.85, 0xe7e5e4);
      const [sw, sd] = long ? [w * 0.28, d * 0.7] : [w * 0.7, d * 0.28];
      add(
        "sink",
        long ? ix + w * 0.12 : ix + (w - sw) / 2,
        long ? iy + (d - sd) / 2 : iy + d * 0.12,
        sw,
        sd,
        0.85,
        0.88,
        0xa1a1aa,
      );
      const [cw, cd] = long ? [w * 0.28, d * 0.75] : [w * 0.75, d * 0.28];
      add(
        "cooktop",
        long ? ix + w - cw - 0.05 : ix + (w - cw) / 2,
        long ? iy + (d - cd) / 2 : iy + d - cd - 0.05,
        cw,
        cd,
        0.85,
        0.88,
        0x18181b,
      );
      break;
    }
    case "bath": {
      if (Math.min(iw, ih) >= 0.9 && iw * ih >= 1.4) {
        const w = Math.min(1.4, iw * 0.9);
        const d = Math.min(0.75, ih * 0.55);
        add("tub", ix + (iw - w) / 2, iy + ih - d, w, d, 0, 0.55, 0xf8fafc);
      } else {
        const w = Math.min(0.75, iw * 0.8);
        const d = Math.min(0.5, ih * 0.5);
        add("vanity", ix, iy, w, d, 0, 0.8, 0xf8fafc);
      }
      break;
    }
    case "toilet": {
      const w = Math.min(0.4, iw * 0.6);
      add(
        "tank",
        ix + (iw - w) / 2,
        iy,
        w,
        Math.min(0.2, ih * 0.25),
        0,
        0.75,
        0xf8fafc,
      );
      const bw = Math.min(0.36, iw * 0.55);
      add(
        "bowl",
        ix + (iw - bw) / 2,
        iy + Math.min(0.2, ih * 0.25),
        bw,
        Math.min(0.5, ih * 0.5),
        0,
        0.4,
        0xf8fafc,
      );
      break;
    }
    case "entrance": {
      const w = Math.min(0.35, iw * 0.3);
      add("shoes", ix + iw - w, iy + ih * 0.1, w, ih * 0.8, 0, 1.0, 0xf5f0e8);
      break;
    }
    case "living": {
      const w = Math.min(1.8, iw * 0.7);
      const d = Math.min(0.8, ih * 0.3);
      const x = ix + (iw - w) / 2;
      add("sofa", x, iy + ih - d, w, d, 0, 0.42, 0x64748b);
      if (ih >= 2.2) {
        const tw = Math.min(0.9, w * 0.6);
        add(
          "table",
          ix + (iw - tw) / 2,
          iy + ih - d - 0.85,
          tw,
          0.5,
          0.3,
          0.35,
          0xa16207,
        );
      }
      break;
    }
    default:
      break;
  }
  return out;
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
  perspective = false,
  exportRef,
}: FloorPlanSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef(result);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const motionRef = useRef(reducedMotion);
  const perspectiveRef = useRef(perspective);
  const exportHolder = useRef(exportRef);
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
    /* 縦長の画面（スマホ）では横の画角が狭く、家の左右が切れる。引いて見る */
    const narrow = host.clientWidth < 640;
    const stage = createStage(host, {
      fov: 34,
      camera: narrow ? [0, 20, 22] : [0, 12, 13],
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
    let wallH = perspectiveRef.current ? WALL_H_FULL : WALL_H;

    function rebuild(r: FloorPlanResult) {
      current = r;
      world.clear();
      pool.clear();
      wallsById.clear();
      wallH = perspectiveRef.current ? WALL_H_FULL : WALL_H;
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
            pool.keep(new BoxGeometry(sw, wallH, sd)),
            wallMat,
          );
          m.position.set(cx, wallH / 2, cz);
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.roomId = room.id;
          world.add(m);
          meshes.push(m);
        }
        wallsById.set(room.id, meshes);
        if (perspectiveRef.current) {
          for (const f of fixturesForRoom(room)) {
            const fm = new Mesh(
              pool.keep(new BoxGeometry(f.w, f.z1 - f.z0, f.d)),
              pool.keep(
                new MeshStandardMaterial({ color: f.color, roughness: 0.6 }),
              ),
            );
            const [fx, fz] = planToWorld([f.x + f.w / 2, f.y + f.d / 2], ctr);
            fm.position.set(fx, (f.z0 + f.z1) / 2, fz);
            fm.castShadow = true;
            fm.receiveShadow = true;
            fm.name = f.kind;
            world.add(fm);
          }
        }
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
          m.position.y = rid === id ? wallH / 2 + 0.02 : wallH / 2;
        }
      }
    }

    apiRef.current = { rebuild, select };
    rebuild(resultRef.current);

    // 書き出し。three.js の書き出し器は使うときに読む。作った .glb は
    // 呼び出し側に返すだけで、ここからはどこにも送らない
    const holder = exportHolder.current;
    if (holder)
      holder.current = async () => {
        const { GLTFExporter } =
          await import("three/examples/jsm/exporters/GLTFExporter.js");
        const buf = (await new GLTFExporter().parseAsync(world, {
          binary: true,
        })) as ArrayBuffer;
        return new Blob([buf], { type: "model/gltf-binary" });
      };

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
      if (holder) holder.current = null;
    };
  }, []);

  useEffect(() => {
    perspectiveRef.current = perspective;
    apiRef.current?.rebuild(resultRef.current);
  }, [perspective]);

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
      className="h-[380px] w-full cursor-pointer md:h-[600px]"
      role="img"
      aria-label="描いた間取りの模型。部屋の床に八宅の区画の吉凶を塗ってある。部屋を押すと選べます"
    />
  );
}
