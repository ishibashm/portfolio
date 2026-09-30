"use client";

/**
 * 八宅の間取りの立体（three.js）。**描くだけ。**区画も置き場所も向きも
 * fengShuiRoomModel が決めたものを写す。
 *
 * - 床: 木の床に 8 区画を吉（緑）・凶（赤）で薄く塗り、境目を線で引く。
 *   区画ごとに方位・遊星・吉凶を床に書く。中心に太極
 * - 家具: ベッド・机と椅子・コンロ・浴槽を形から組む（外部の模型を読まない）。
 *   頭・顔・焚き口の向きには床に金の矢印
 * - 押した区画・家具を選ぶ（区画の判定は判定と同じ境目）
 *
 * 床の絵と座標の対応は三盤の方位盤の盤面と同じ（絵の上が北、右が東。
 * 上面を −90 度寝かせる）。threeBoardCanvas のテストが three.js の実物で
 * 固定している対応を、正方形の床に使う。
 */

import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Object3D,
} from "three";
import { createStage } from "@/lib/threeStage";
import {
  distanceToEdge,
  sectorOfPoint,
  type RoomItem,
  type RoomModel,
} from "@/lib/fengShuiRoomModel";
import type { CompassDirection } from "@/utils/directionGeo";

const TEX = 2048;
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
const WALL_H = 0.55;
const WALL_T = 0.16;
const FLOOR_T = 0.24;

export type RoomSelection =
  | { type: "sector"; direction: CompassDirection }
  | { type: "item"; kind: RoomItem["kind"] };

export interface FengShuiRoomSceneProps {
  model: RoomModel;
  selection: RoomSelection | null;
  onSelect: (s: RoomSelection) => void;
  reducedMotion: boolean;
}

/** 床の座標（x, z）→ 絵の座標。絵の上が北（−z）、右が東（+x） */
function toCanvas(x: number, z: number, half: number): [number, number] {
  return [((x + half) / (2 * half)) * TEX, ((z + half) / (2 * half)) * TEX];
}

/** 床の絵。板目・区画の色・境目・文字・太極 */
function paintFloor(model: RoomModel): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  const { half } = model;

  // 板目（幅をそろえた板に、わずかな色むらと継ぎ目）
  const plank = TEX / 16;
  for (let i = 0; i < 16; i++) {
    const shade = 0.9 + ((i * 37) % 11) / 100;
    g.fillStyle = `rgb(${Math.round(196 * shade)},${Math.round(160 * shade)},${Math.round(118 * shade)})`;
    g.fillRect(0, i * plank, TEX, plank);
    g.strokeStyle = "rgba(60,38,20,0.35)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, i * plank);
    g.lineTo(TEX, i * plank);
    g.stroke();
    const seam = ((i * 523) % 1000) / 1000;
    g.beginPath();
    g.moveTo(seam * TEX, i * plank);
    g.lineTo(seam * TEX, (i + 1) * plank);
    g.stroke();
  }

  // 区画の色
  for (const s of model.sectors) {
    g.beginPath();
    s.polygon.forEach(([x, z], i) => {
      const [cx, cy] = toCanvas(x, z, half);
      if (i === 0) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    });
    g.closePath();
    g.fillStyle = s.auspicious
      ? "rgba(16,185,129,0.34)"
      : "rgba(225,29,72,0.30)";
    g.fill();
  }
  // 境目
  for (const s of model.sectors) {
    const [x, z] = s.polygon[1];
    const [cx, cy] = toCanvas(x, z, half);
    const [ox, oy] = toCanvas(0, 0, half);
    g.strokeStyle = "rgba(41,24,12,0.8)";
    g.lineWidth = 8;
    g.setLineDash([28, 16]);
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(cx, cy);
    g.stroke();
    g.setLineDash([]);
  }
  // 文字（区画の中ほど。縁に寄せて、家具と重ならないように）
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const s of model.sectors) {
    // 区画の中心線の上で、縁の少し手前（家具は中ほどに置いてある）
    const midDeg = (s.startDeg + s.endDeg) / 2;
    const mid = midDeg * (Math.PI / 180);
    const r = distanceToEdge(midDeg, half) - 0.8;
    const [cx, cy] = toCanvas(Math.sin(mid) * r, -Math.cos(mid) * r, half);
    const x = Math.min(Math.max(cx, 160), TEX - 160);
    const y = Math.min(Math.max(cy, 90), TEX - 90);
    g.fillStyle = "rgba(255,251,235,0.92)";
    g.beginPath();
    g.roundRect(x - 150, y - 70, 300, 140, 26);
    g.fill();
    g.fillStyle = s.auspicious ? "#065f46" : "#9f1239";
    g.font = `800 58px ${FONT}`;
    g.fillText(`${s.label}・${s.auspicious ? "吉" : "凶"}`, x, y - 26);
    g.font = `700 50px ${FONT}`;
    g.fillStyle = "#292524";
    g.fillText(s.youxing, x, y + 34);
  }
  // 太極（家の中心）
  const [ox, oy] = toCanvas(0, 0, half);
  g.fillStyle = "#1c1917";
  g.beginPath();
  g.arc(ox, oy, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fef3c7";
  g.font = `800 44px ${FONT}`;
  g.fillText("太極", ox, oy);
  return c;
}

function wood(pool: ReturnType<typeof createStage>["pool"], color: number) {
  return pool.keep(
    new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02 }),
  );
}

/** 家具を形から組む。前（頭・顔・焚き口）が局所の −z */
function buildItem(
  item: RoomItem,
  pool: ReturnType<typeof createStage>["pool"],
): Group {
  const grp = new Group();
  const add = (
    geo: BufferGeometry,
    mat: Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new Mesh(pool.keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  const { w, d } = item;
  if (item.kind === "bed") {
    const frame = wood(pool, 0x7c4a2d);
    add(new BoxGeometry(w, 0.32, d), frame, 0, 0.16, 0);
    add(new BoxGeometry(w, 0.7, 0.1), frame, 0, 0.35, -d / 2 + 0.05); // 頭板
    const sheet = pool.keep(
      new MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.9 }),
    );
    add(new BoxGeometry(w - 0.1, 0.18, d - 0.14), sheet, 0, 0.41, 0.03);
    const duvet = pool.keep(
      new MeshStandardMaterial({ color: 0x6366f1, roughness: 0.85 }),
    );
    add(new BoxGeometry(w - 0.06, 0.12, d * 0.58), duvet, 0, 0.52, d * 0.18);
    const pillow = pool.keep(
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    );
    add(new BoxGeometry(w * 0.7, 0.14, 0.34), pillow, 0, 0.55, -d / 2 + 0.32);
  } else if (item.kind === "desk") {
    const top = wood(pool, 0x9a6b43);
    const deskD = d * 0.55;
    const deskZ = -d / 2 + deskD / 2;
    add(new BoxGeometry(w, 0.06, deskD), top, 0, 0.74, deskZ);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(
          new BoxGeometry(0.06, 0.72, 0.06),
          top,
          (sx * (w - 0.1)) / 2,
          0.36,
          deskZ + (sz * (deskD - 0.1)) / 2,
        );
      }
    }
    // 椅子（机の手前。座る人は机＝前を向く）
    const seat = pool.keep(
      new MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }),
    );
    const chairZ = d / 2 - 0.25;
    add(new BoxGeometry(0.46, 0.06, 0.44), seat, 0, 0.46, chairZ);
    add(new BoxGeometry(0.46, 0.5, 0.06), seat, 0, 0.72, chairZ + 0.2);
    add(new CylinderGeometry(0.04, 0.04, 0.44, 10), seat, 0, 0.22, chairZ);
    // 机の上の本
    const book = pool.keep(
      new MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }),
    );
    add(new BoxGeometry(0.34, 0.05, 0.26), book, -w * 0.25, 0.8, deskZ);
  } else if (item.kind === "stove") {
    const body = pool.keep(
      new MeshPhysicalMaterial({
        color: 0xe7e5e4,
        roughness: 0.35,
        metalness: 0.3,
        clearcoat: 0.4,
      }),
    );
    add(new BoxGeometry(w, 0.86, d), body, 0, 0.43, 0);
    const plate = pool.keep(
      new MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4 }),
    );
    add(new BoxGeometry(w - 0.08, 0.02, d - 0.08), plate, 0, 0.87, 0);
    const burner = pool.keep(
      new MeshStandardMaterial({
        color: 0x44403c,
        emissive: new Color(0xf97316),
        emissiveIntensity: 0.35,
        roughness: 0.5,
      }),
    );
    for (const sx of [-1, 1]) {
      add(
        new CylinderGeometry(0.16, 0.16, 0.03, 24),
        burner,
        sx * w * 0.24,
        0.89,
        0,
      );
    }
    // 焚き口（つまみの並ぶ面）が前
    const knob = pool.keep(
      new MeshStandardMaterial({ color: 0x57534e, roughness: 0.4 }),
    );
    for (const sx of [-0.3, 0, 0.3]) {
      const k = add(
        new CylinderGeometry(0.05, 0.05, 0.06, 16),
        knob,
        sx * w,
        0.7,
        -d / 2 - 0.02,
      );
      k.rotation.x = Math.PI / 2;
    }
  } else {
    const tile = pool.keep(
      new MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.3 }),
    );
    add(new BoxGeometry(w, 0.6, d), tile, 0, 0.3, 0);
    const water = pool.keep(
      new MeshPhysicalMaterial({
        color: 0x38bdf8,
        roughness: 0.05,
        transmission: 0.2,
        transparent: true,
        opacity: 0.85,
      }),
    );
    add(new BoxGeometry(w - 0.24, 0.02, d - 0.24), water, 0, 0.61, 0);
  }
  // 位置と向き。局所の −z（前）が方位角 facingDeg を向くよう、y 軸まわりに
  // −facingDeg 回す（方位角は北から時計回り、three の y 回転は反時計回り）
  grp.position.set(item.x, 0, item.z);
  grp.rotation.y = (-item.facingDeg * Math.PI) / 180;
  grp.userData.kind = item.kind;
  return grp;
}

/** 床に置く金の矢印（前の向き）。家具の前の端から外へ */
function buildArrow(
  item: RoomItem,
  pool: ReturnType<typeof createStage>["pool"],
): Group {
  const grp = new Group();
  const gold = pool.keep(
    new MeshStandardMaterial({
      color: 0xd4a017,
      metalness: 0.6,
      roughness: 0.3,
      emissive: new Color(0x5a3d00),
    }),
  );
  const len = 0.7;
  const shaft = new Mesh(pool.keep(new BoxGeometry(0.1, 0.03, len)), gold);
  shaft.position.set(0, 0.03, -len / 2);
  const head = new Mesh(pool.keep(new ConeGeometry(0.2, 0.36, 3)), gold);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0.03, -len - 0.14);
  grp.add(shaft, head);
  const rad = (item.facingDeg * Math.PI) / 180;
  const start = item.d / 2 + 0.08;
  grp.position.set(
    item.x + Math.sin(rad) * start,
    0,
    item.z - Math.cos(rad) * start,
  );
  grp.rotation.y = -rad;
  return grp;
}

export default function FengShuiRoomScene({
  model,
  selection,
  onSelect,
  reducedMotion,
}: FengShuiRoomSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  const selectionRef = useRef(selection);
  const onSelectRef = useRef(onSelect);
  const motionRef = useRef(reducedMotion);
  const apiRef = useRef<{
    rebuild: (m: RoomModel) => void;
    select: (s: RoomSelection | null) => void;
  } | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const half = modelRef.current.half;
    const stage = createStage(host, {
      fov: 34,
      camera: [0, 12.5, 14.5],
      target: [0, 0, 0.3],
      minDistance: 9,
      maxDistance: 30,
      maxPolarAngle: 1.25,
      autoRotate: !motionRef.current,
      autoRotateSpeed: 0.35,
      sunOffset: [6, 14, 8],
      shadowExtent: half + 2,
    });
    const { scene, pool } = stage;
    const world = new Group();
    scene.add(world);

    let floor: Mesh | null = null;
    let items: Group[] = [];
    let outline: Object3D | null = null;
    let current = modelRef.current;

    function rebuild(m: RoomModel) {
      current = m;
      world.clear();
      pool.clear();
      items = [];
      outline = null;
      const h = m.half;

      // 床の台（厚み）と、板目と区画を描いた上面
      const base = new Mesh(
        pool.keep(new BoxGeometry(2 * h, FLOOR_T, 2 * h)),
        wood(pool, 0x5b3a22),
      );
      base.position.y = -FLOOR_T / 2;
      base.receiveShadow = true;
      world.add(base);
      floor = new Mesh(
        pool.keep(new PlaneGeometry(2 * h, 2 * h)),
        pool.keep(
          new MeshStandardMaterial({
            map: pool.texture(paintFloor(m)),
            roughness: 0.62,
            metalness: 0,
            envMapIntensity: 0.4,
          }),
        ),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.002;
      floor.receiveShadow = true;
      world.add(floor);

      // 低い壁（中が見えるよう腰の高さ）
      const wall = pool.keep(
        new MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 }),
      );
      for (const [x, z, w, d] of [
        [0, -h - WALL_T / 2, 2 * h + 2 * WALL_T, WALL_T],
        [0, h + WALL_T / 2, 2 * h + 2 * WALL_T, WALL_T],
        [-h - WALL_T / 2, 0, WALL_T, 2 * h],
        [h + WALL_T / 2, 0, WALL_T, 2 * h],
      ] as const) {
        const wm = new Mesh(pool.keep(new BoxGeometry(w, WALL_H, d)), wall);
        wm.position.set(x, WALL_H / 2 - FLOOR_T, z);
        wm.castShadow = true;
        wm.receiveShadow = true;
        world.add(wm);
      }

      for (const item of m.items) {
        const g = buildItem(item, pool);
        world.add(g);
        items.push(g);
        if (item.facing) world.add(buildArrow(item, pool));
      }
      select(selectionRef.current);
    }

    function select(s: RoomSelection | null) {
      selectionRef.current = s;
      if (outline) world.remove(outline);
      outline = null;
      if (!s) return;
      const mat = pool.keep(
        new LineBasicMaterial({ color: 0xfff7d6, linewidth: 2 }),
      );
      const pts: number[] = [];
      if (s.type === "sector") {
        const sec = current.sectors.find((x) => x.direction === s.direction);
        if (!sec) return;
        for (const [x, z] of sec.polygon) pts.push(x, 0.03, z);
      } else {
        const it = current.items.find((x) => x.kind === s.kind);
        if (!it) return;
        const rad = (it.facingDeg * Math.PI) / 180;
        const f = [Math.sin(rad), -Math.cos(rad)];
        const r = [Math.cos(rad), Math.sin(rad)];
        for (const [a, b] of [
          [1, 1],
          [1, -1],
          [-1, -1],
          [-1, 1],
        ]) {
          pts.push(
            it.x + (f[0] * it.d * a) / 2 + (r[0] * it.w * b) / 2,
            0.03,
            it.z + (f[1] * it.d * a) / 2 + (r[1] * it.w * b) / 2,
          );
        }
      }
      const geo = pool.keep(new BufferGeometry());
      geo.setAttribute("position", new Float32BufferAttribute(pts, 3));
      outline = new LineLoop(geo, mat);
      world.add(outline);
    }

    apiRef.current = { rebuild, select };
    rebuild(modelRef.current);

    // 家具を押したら家具、床を押したらその区画（判定と同じ境目）
    stage.onPick(
      () => items.flatMap((g) => g.children),
      (hit) => {
        let o: Object3D | null = hit.object;
        while (o && !o.userData.kind) o = o.parent;
        if (o) onSelectRef.current({ type: "item", kind: o.userData.kind });
      },
    );
    stage.onPick(
      () => (floor ? [floor] : []),
      (hit) => {
        onSelectRef.current({
          type: "sector",
          direction: sectorOfPoint(hit.point.x, hit.point.z),
        });
      },
    );
    return () => {
      stage.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    modelRef.current = model;
    apiRef.current?.rebuild(model);
  }, [model]);
  useEffect(() => {
    apiRef.current?.select(selection);
  }, [selection]);

  return (
    <div
      ref={hostRef}
      className="h-[440px] w-full cursor-pointer md:h-[560px]"
      role="img"
      aria-label="八宅の区画を床に塗った家の模型。区画や家具を押すと、その内訳を下に出します"
    />
  );
}
