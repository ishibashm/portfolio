"use client";

/**
 * 地球儀の上の方位の扇形（three.js）。**描くだけ。**点も線も globeModel が
 * 決めたもの（緯度経度）を球に貼る。
 *
 * - 海の球に経緯線（10 度ごと）
 * - 8 方位の扇形を、大圏で刻んだ格子で球の表面に沿わせて薄く塗る
 * - 境目は 2 本ずつ: 大圏（判定と同じ、白の実線）と、地図に直線を引いた
 *   ときの等角航路（朱）。遠いほど開く
 * - 街は方位の色の点。地図の直線では別の方位に見える街は、白い輪で囲む
 */

import { useEffect, useRef } from "react";
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  Vector3,
} from "three";
import { createStage } from "@/lib/threeStage";
import { toXYZ, type GlobeCity, type GeoPoint } from "@/lib/globeModel";
import {
  destinationAtBearing,
  type CompassDirection,
} from "@/utils/directionGeo";
/* 色は平面の図と同じものを使う（写さない）。親はこの部品より先に読まれている */
import { DIRECTION_COLOR } from "@/components/houi/GreatCircleGlobe";

export const GLOBE_R = 5;

export interface GlobeSceneData {
  origin: GeoPoint;
  /** 扇形（方位ごとの境目の方位角 [始まり, 終わり]） */
  wedges: { direction: CompassDirection; start: number; end: number }[];
  /** 境目の線（大圏と等角航路） */
  lines: { greatCircle: GeoPoint[]; rhumb: GeoPoint[] }[];
  cities: GlobeCity[];
  rangeKm: number;
}

export interface GlobeSceneProps {
  data: GlobeSceneData;
  reducedMotion: boolean;
}

const v = (p: GeoPoint, lift = 1) =>
  new Vector3(...toXYZ(p.lat, p.lon, GLOBE_R * lift));

export default function GlobeScene({ data }: GlobeSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  const apiRef = useRef<{ rebuild: (d: GlobeSceneData) => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const o = dataRef.current.origin;
    const eye = new Vector3(...toXYZ(o.lat - 9, o.lon, GLOBE_R + 8));
    const stage = createStage(host, {
      fov: 30,
      camera: [eye.x, eye.y, eye.z],
      target: [0, 0, 0],
      minDistance: GLOBE_R + 2.2,
      maxDistance: GLOBE_R * 5,
      maxPolarAngle: Math.PI,
      autoRotate: false,
      sunOffset: [5, 8, 10],
      shadowExtent: GLOBE_R + 1,
      exposure: 1.05,
    });
    stage.controls.rotateSpeed = 0.5;
    const { scene, pool, camera, controls } = stage;
    const world = new Group();
    scene.add(world);

    // 海と経緯線は作り直さない
    const sea = new Mesh(
      new SphereGeometry(GLOBE_R, 128, 96),
      new MeshPhysicalMaterial({
        color: 0x0b3a5b,
        roughness: 0.7,
        clearcoat: 0.15,
        clearcoatRoughness: 0.6,
        /* 映り込みを弱める。強いと海が白く曇って扇形の色が読めない */
        envMapIntensity: 0.25,
      }),
    );
    scene.add(sea);
    const gratMat = new LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.22,
    });
    const graticule = new Group();
    for (let lat = -80; lat <= 80; lat += 10) {
      const pts: Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 2)
        pts.push(v({ lat, lon }, 1.001));
      graticule.add(new Line(new BufferGeometry().setFromPoints(pts), gratMat));
    }
    for (let lon = -180; lon < 180; lon += 10) {
      const pts: Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 2) pts.push(v({ lat, lon }, 1.001));
      graticule.add(new Line(new BufferGeometry().setFromPoints(pts), gratMat));
    }
    scene.add(graticule);

    function rebuild(d: GlobeSceneData) {
      world.clear();
      pool.clear();

      // 扇形: 大圏で刻んだ格子（半径方向 × 方位角方向）で球に沿わせる
      const R_STEPS = 16;
      for (const w of d.wedges) {
        const span = w.end - w.start;
        const A_STEPS = Math.max(4, Math.round(span / 3));
        const pos: number[] = [];
        const idx: number[] = [];
        for (let i = 0; i <= R_STEPS; i++) {
          const km = (d.rangeKm * i) / R_STEPS;
          for (let j = 0; j <= A_STEPS; j++) {
            const b = w.start + (span * j) / A_STEPS;
            const p =
              i === 0
                ? d.origin
                : destinationAtBearing(d.origin.lat, d.origin.lon, b, km);
            const q = v(p, 1.002);
            pos.push(q.x, q.y, q.z);
          }
        }
        const row = A_STEPS + 1;
        for (let i = 0; i < R_STEPS; i++) {
          for (let j = 0; j < A_STEPS; j++) {
            const a = i * row + j;
            idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
          }
        }
        const geo = pool.keep(new BufferGeometry());
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mesh = new Mesh(
          geo,
          pool.keep(
            new MeshBasicMaterial({
              color: new Color(DIRECTION_COLOR[w.direction]),
              transparent: true,
              opacity: 0.16,
              depthWrite: false,
              side: DoubleSide,
            }),
          ),
        );
        world.add(mesh);
      }

      // 境目の線（細い管。WebGL の線は太さを持てず、球の上では見えにくい）
      const gcMat = pool.keep(new MeshBasicMaterial({ color: 0xffffff }));
      const rhMat = pool.keep(new MeshBasicMaterial({ color: 0xf97316 }));
      const tube = (pts: GeoPoint[], lift: number, mat: MeshBasicMaterial) =>
        new Mesh(
          pool.keep(
            new TubeGeometry(
              new CatmullRomCurve3(pts.map((p) => v(p, lift))),
              pts.length * 2,
              0.014,
              6,
              false,
            ),
          ),
          mat,
        );
      for (const l of d.lines) {
        world.add(tube(l.greatCircle, 1.004, gcMat));
        world.add(tube(l.rhumb, 1.005, rhMat));
      }

      // 街の点（方位の色）。食い違う街は白い輪
      if (d.cities.length > 0) {
        const dot = pool.keep(new SphereGeometry(0.028, 10, 8));
        const mat = pool.keep(new MeshStandardMaterial({ roughness: 0.4 }));
        const inst = new InstancedMesh(dot, mat, d.cities.length);
        const m = new Matrix4();
        d.cities.forEach((c, i) => {
          const p = v(c, 1.006);
          m.makeTranslation(p.x, p.y, p.z);
          inst.setMatrixAt(i, m);
          inst.setColorAt(i, new Color(DIRECTION_COLOR[c.direction]));
        });
        world.add(inst);
        const ringGeo = pool.keep(new RingGeometry(0.06, 0.085, 24));
        const ringMat = pool.keep(
          new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }),
        );
        for (const c of d.cities.filter((x) => x.differs)) {
          const ring = new Mesh(ringGeo, ringMat);
          const p = v(c, 1.007);
          ring.position.copy(p);
          ring.lookAt(p.clone().multiplyScalar(2));
          world.add(ring);
        }
      }

      // 出発地の印（金の錐）
      const pin = new Mesh(
        pool.keep(new ConeGeometry(0.09, 0.32, 16)),
        pool.keep(
          new MeshStandardMaterial({
            color: 0xd4a54a,
            metalness: 0.8,
            roughness: 0.3,
          }),
        ),
      );
      const op = v(d.origin, 1);
      const up = op.clone().normalize();
      pin.position.copy(op.clone().add(up.clone().multiplyScalar(0.16)));
      // 錐の先（+y）を球の中心へ向け、先が出発地に触れるようにする
      pin.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        up.clone().negate(),
      );
      world.add(pin);
    }

    apiRef.current = {
      rebuild: (d) => {
        const moved =
          d.origin.lat !== dataRef.current.origin.lat ||
          d.origin.lon !== dataRef.current.origin.lon;
        dataRef.current = d;
        rebuild(d);
        if (moved) {
          // 出発地を正面に（距離は保つ）
          const dist = camera.position.length();
          const e = new Vector3(...toXYZ(d.origin.lat - 9, d.origin.lon, 1));
          camera.position.copy(e.multiplyScalar(dist));
          controls.update();
        }
      },
    };
    rebuild(dataRef.current);

    return () => {
      sea.geometry.dispose();
      (sea.material as MeshPhysicalMaterial).dispose();
      graticule.children.forEach((c) => (c as Line).geometry.dispose());
      gratMat.dispose();
      stage.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild(data);
  }, [data]);

  return (
    <div
      ref={hostRef}
      className="h-[440px] w-full md:h-[560px]"
      role="img"
      aria-label="地球儀の上に、出発地から見た 8 方位の扇形を大圏で描いた図。白い線が判定の境目、橙の線が地図に直線を引いたときの境目"
    />
  );
}
