import { describe, expect, it } from "vitest";
import { CircleGeometry, Mesh, MeshBasicMaterial, Vector3 } from "three";
import {
  boardPointOfCanvas,
  canvasPointOfBearing,
} from "@/lib/threeBoardCanvas";
import { bearingOfPoint } from "@/lib/threeBoardModel";

/**
 * 立体の盤の、盤面の絵（canvas）と盤の上の座標の対応を、three.js の実物と
 * 突き合わせる。
 *
 * 盤面の扇形は canvas に描き、円盤の上面（CircleGeometry を寝かせたもの）に
 * 貼る。押した点の方位は盤の上の座標から出す。**この 2 つの向きがずれると、
 * 塗った扇形と押して出る方位が食い違う**（地図の扇形で実際に起きた種類の
 * ずれ。#776）。
 *
 * - 上面の頂点ごとに、UV から求めた canvas の座標 → boardPointOfCanvas が、
 *   実際に寝かせた頂点の位置（x, z）と一致する
 * - canvas に方位角 b で描いた点は、盤の上でも方位角 b になる
 */

const SIZE = 2048;

describe("canvas と盤の上の座標", () => {
  it("上面の全頂点で、UV からの座標が寝かせた実際の位置と一致する", () => {
    const geo = new CircleGeometry(1, 64);
    const mesh = new Mesh(geo, new MeshBasicMaterial());
    mesh.rotation.x = -Math.PI / 2; // 立体の盤と同じ寝かせ方
    mesh.updateMatrixWorld(true);
    const pos = geo.getAttribute("position");
    const uv = geo.getAttribute("uv");
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      // テクスチャは flipY（既定）なので canvas の上が v = 1
      const cx = uv.getX(i) * SIZE;
      const cy = (1 - uv.getY(i)) * SIZE;
      const [x, z] = boardPointOfCanvas(cx, cy, SIZE);
      // 頂点と UV は float32 で持たれるので、比べる精度は 1e-6
      expect(x).toBeCloseTo(v.x, 6);
      expect(z).toBeCloseTo(v.z, 6);
      expect(v.y).toBeCloseTo(0, 6);
    }
  });

  it("canvas に方位角 b で描いた点は、盤の上でも方位角 b", () => {
    for (let b = 0; b < 360; b += 7.5) {
      const [cx, cy] = canvasPointOfBearing(b, 0.8, SIZE);
      const [x, z] = boardPointOfCanvas(cx, cy, SIZE);
      expect(bearingOfPoint(x, z)).toBeCloseTo(b, 9);
      expect(Math.hypot(x, z)).toBeCloseTo(0.8, 9);
    }
  });

  it("北は絵の上、東は絵の右", () => {
    const [nx, ny] = canvasPointOfBearing(0, 1, SIZE);
    expect(nx).toBeCloseTo(SIZE / 2, 9);
    expect(ny).toBeCloseTo(0, 9);
    const [ex, ey] = canvasPointOfBearing(90, 1, SIZE);
    expect(ex).toBeCloseTo(SIZE, 9);
    expect(ey).toBeCloseTo(SIZE / 2, 9);
  });
});
