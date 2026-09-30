"use client";

/**
 * 羅盤の立体（three.js）。**描くだけ。**角度はすべて compassModel が決めた
 * ものを写す。
 *
 * - 盤: 木の器に、真北に合わせた 8 方位の扇形（判定と同じ区切り）と
 *   5 度刻みの目盛り。方位磁針で測ったときの境目（磁北で切った扇形）を
 *   朱の点線で重ねる
 * - 真北: 縁に金の指標（動かない）
 * - 磁針: 中心の軸に載せ、偏角ぶん回す。北の先が朱、南が藍
 * - 目的地を選ぶと、中心から金の糸を張る
 *
 * 盤面の絵と座標の対応は三盤の方位盤と同じ（threeBoardCanvas。three.js の
 * 円の実物で検査済み）。
 */

import { useEffect, useRef } from "react";
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
} from "three";
import { createStage } from "@/lib/threeStage";
import {
  canvasAngleOfBearing,
  canvasPointOfBearing,
} from "@/lib/threeBoardCanvas";
import type { CompassModel } from "@/lib/compassModel";

const TEX = 2048;
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
const R = 3; // 盤面の半径
const RIM = 3.4; // 器の外径
const GOLD = "#d4a54a";

export interface CompassSceneProps {
  model: CompassModel;
  reducedMotion: boolean;
}

/** 盤面の絵 */
function paintFace(model: CompassModel): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  const h = TEX / 2;

  const bg = g.createRadialGradient(h, h, 0, h, h, h);
  bg.addColorStop(0, "#f7ecd4");
  bg.addColorStop(1, "#e4cfa3");
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);

  // 真北で切った 8 方位（判定と同じ）。交互に薄く塗る
  const r0 = h * 0.34;
  const r1 = h * 0.8;
  model.sectors.forEach((s, i) => {
    g.beginPath();
    g.arc(
      h,
      h,
      r1,
      canvasAngleOfBearing(s.startDeg),
      canvasAngleOfBearing(s.endDeg),
    );
    g.arc(
      h,
      h,
      r0,
      canvasAngleOfBearing(s.endDeg),
      canvasAngleOfBearing(s.startDeg),
      true,
    );
    g.closePath();
    g.fillStyle = i % 2 === 0 ? "rgba(120,72,30,0.16)" : "rgba(120,72,30,0.06)";
    g.fill();
    // 境目（墨の実線）
    const a = canvasAngleOfBearing(s.startDeg);
    g.strokeStyle = "#3b2414";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
    g.lineTo(h + Math.cos(a) * h * 0.92, h + Math.sin(a) * h * 0.92);
    g.stroke();
    // 方位の字
    const mid = (s.startDeg + s.endDeg) / 2;
    const [x, y] = canvasPointOfBearing(mid, 0.66, TEX);
    g.fillStyle = "#2a1a0e";
    g.font = `800 ${Math.round(TEX * 0.05)}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s.label, x, y);
  });

  // 方位磁針で測ったときの境目（磁北で切った扇形）。朱の点線
  if (Math.abs(model.declination) > 0.05) {
    g.strokeStyle = "rgba(190,40,30,0.85)";
    g.lineWidth = 6;
    g.setLineDash([26, 18]);
    for (const s of model.sectors) {
      const a = canvasAngleOfBearing(s.magStartDeg);
      g.beginPath();
      g.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
      g.lineTo(h + Math.cos(a) * h * 0.86, h + Math.sin(a) * h * 0.86);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // 目盛り: 5 度ごと、30 度ごとに数字
  for (let deg = 0; deg < 360; deg += 5) {
    const a = canvasAngleOfBearing(deg);
    const long = deg % 15 === 0;
    const ra = h * 0.84;
    const rb = h * (long ? 0.93 : 0.9);
    g.strokeStyle = "#3b2414";
    g.lineWidth = long ? 6 : 3;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * ra, h + Math.sin(a) * ra);
    g.lineTo(h + Math.cos(a) * rb, h + Math.sin(a) * rb);
    g.stroke();
    if (deg % 30 === 0) {
      const [x, y] = canvasPointOfBearing(deg, 0.965, TEX);
      g.fillStyle = "#3b2414";
      g.font = `700 ${Math.round(TEX * 0.026)}px ${FONT}`;
      g.fillText(`${deg}`, x, y);
    }
  }
  for (const rr of [r0, r1, h * 0.84, h * 0.995]) {
    g.strokeStyle = "#3b2414";
    g.lineWidth = rr === h * 0.995 ? 14 : 4;
    g.beginPath();
    g.arc(h, h, rr, 0, Math.PI * 2);
    g.stroke();
  }
  // 中心の円（天池）
  g.fillStyle = "#fbf4e2";
  g.beginPath();
  g.arc(h, h, r0 - 6, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** 器（旋盤で回した断面） */
function bowl(): LatheGeometry {
  const pts = [
    new Vector2(0, -0.3),
    new Vector2(RIM - 0.25, -0.3),
    new Vector2(RIM, -0.12),
    new Vector2(RIM, 0.14),
    new Vector2(RIM - 0.12, 0.2),
    new Vector2(R + 0.02, 0.2),
    new Vector2(R, 0.04),
    new Vector2(0.001, 0.04),
  ];
  return new LatheGeometry(pts, 160);
}

export default function CompassScene({
  model,
  reducedMotion,
}: CompassSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  const motionRef = useRef(reducedMotion);
  const apiRef = useRef<{ rebuild: (m: CompassModel) => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = createStage(host, {
      fov: 30,
      camera: [0, 11, 7.5],
      target: [0, 0, 0.2],
      minDistance: 7,
      maxDistance: 22,
      maxPolarAngle: 1.2,
      autoRotate: false,
      sunOffset: [4, 10, 6],
      shadowExtent: 5,
    });
    const { scene, pool } = stage;
    const world = new Group();
    scene.add(world);

    let needle: Group | null = null;
    let needleAngle = 0; // いま描いている角度（度）
    let needleVel = 0;
    let needleTarget = 0;

    function rebuild(m: CompassModel) {
      world.clear();
      pool.clear();

      const wood = new Mesh(
        pool.keep(bowl()),
        pool.keep(
          new MeshPhysicalMaterial({
            color: 0x6b3a1f,
            roughness: 0.45,
            clearcoat: 0.6,
            clearcoatRoughness: 0.25,
          }),
        ),
      );
      wood.castShadow = true;
      wood.receiveShadow = true;
      world.add(wood);

      const face = new Mesh(
        pool.keep(new CircleGeometry(R, 192)),
        pool.keep(
          new MeshStandardMaterial({
            map: pool.texture(paintFace(m)),
            roughness: 0.7,
            envMapIntensity: 0.35,
          }),
        ),
      );
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.045;
      face.receiveShadow = true;
      world.add(face);

      const gold = pool.keep(
        new MeshStandardMaterial({
          color: new Color(GOLD),
          metalness: 0.9,
          roughness: 0.28,
        }),
      );

      // 真北の指標（縁の上、動かない）
      const mark = new Mesh(pool.keep(new ConeGeometry(0.16, 0.42, 3)), gold);
      mark.rotation.x = Math.PI / 2; // 先を盤の中心（+z）へ
      mark.position.set(0, 0.28, -RIM + 0.14);
      mark.castShadow = true;
      world.add(mark);

      // 目的地への糸（真北の方位角）
      if (m.target) {
        const b = (m.target.trueBearing * Math.PI) / 180;
        const len = R * 0.97;
        const thread = new Mesh(
          pool.keep(new CylinderGeometry(0.018, 0.018, len, 8)),
          gold,
        );
        thread.rotation.x = Math.PI / 2;
        const holder = new Group();
        holder.add(thread);
        thread.position.z = -len / 2;
        holder.rotation.y = -b;
        holder.position.y = 0.1;
        world.add(holder);
        const bead = new Mesh(
          pool.keep(new SphereGeometry(0.09, 16, 12)),
          gold,
        );
        bead.position.set(Math.sin(b) * len, 0.1, -Math.cos(b) * len);
        world.add(bead);
      }

      // 磁針（中心の軸に載る。北の先が朱、南が藍）
      const pivot = new Mesh(
        pool.keep(new CylinderGeometry(0.1, 0.14, 0.34, 24)),
        gold,
      );
      pivot.position.y = 0.2;
      world.add(pivot);
      needle = new Group();
      const red = pool.keep(
        new MeshPhysicalMaterial({
          color: 0xb91c1c,
          metalness: 0.5,
          roughness: 0.3,
          clearcoat: 0.8,
        }),
      );
      const blue = pool.keep(
        new MeshPhysicalMaterial({
          color: 0x1e3a8a,
          metalness: 0.5,
          roughness: 0.3,
          clearcoat: 0.8,
        }),
      );
      const half = R * 0.3;
      const north = new Mesh(pool.keep(new ConeGeometry(0.12, half, 4)), red);
      north.rotation.x = -Math.PI / 2; // 先を −z（盤の北）へ
      north.position.z = -half / 2;
      const south = new Mesh(pool.keep(new ConeGeometry(0.12, half, 4)), blue);
      south.rotation.x = Math.PI / 2;
      south.position.z = half / 2;
      north.castShadow = south.castShadow = true;
      needle.add(north, south);
      needle.position.y = 0.4;
      world.add(needle);

      needleTarget = m.needleDeg > 180 ? m.needleDeg - 360 : m.needleDeg;
      if (motionRef.current) {
        needleAngle = needleTarget;
        needleVel = 0;
      } else {
        // 揺れてから止まる（本物の磁針のように）
        needleVel += 1.5;
      }
      needle.rotation.y = (-needleAngle * Math.PI) / 180;
    }

    apiRef.current = { rebuild };
    rebuild(modelRef.current);

    stage.onFrame(() => {
      if (!needle) return;
      if (!motionRef.current) {
        // 減衰する振り子（ばね定数と減衰を控えめに）
        const acc = (needleTarget - needleAngle) * 0.02 - needleVel * 0.08;
        needleVel += acc;
        needleAngle += needleVel;
      } else {
        needleAngle = needleTarget;
      }
      needle.rotation.y = (-needleAngle * Math.PI) / 180;
    });

    return () => {
      stage.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    modelRef.current = model;
    apiRef.current?.rebuild(model);
  }, [model]);

  return (
    <div
      ref={hostRef}
      className="h-[400px] w-full md:h-[480px]"
      role="img"
      aria-label="真北に合わせた羅盤。磁針は偏角ぶん西を指し、方位磁針で測ったときの境目を朱の点線で重ねています"
    />
  );
}
