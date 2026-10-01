import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import {
  northArrowPlacement,
  plateBounds,
  planToWorld,
  roomAtPlanPoint,
  worldToPlan,
} from "@/components/houi/FloorPlanScene";
import {
  EXAMPLE_ROOMS,
  bearingOfPlanPoint,
  buildFloorPlan,
} from "@/lib/floorPlanModel";
import { readFengShui } from "@/utils/fengShuiEngine";

/**
 * 自分の間取りの立体。描くこと自体は jsdom で見られないので、立体が
 * 中身を写すときの対応（図 ⇄ 床、方位記号の矢印の向き）を固定する。
 * 矢印の向きは three.js の実物（Object3D）に回させて確かめる。
 */

const reading = readFengShui(1990, "female");
const build = (north: number) =>
  buildFloorPlan(
    {
      rooms: [...EXAMPLE_ROOMS],
      northArrowDeg: north,
      centerMethod: "centroid",
    },
    reading,
  )!;

describe("図と床の対応", () => {
  it("太極が床の原点で、行って戻ると同じ点", () => {
    const r = build(0);
    expect(planToWorld(r.center, r.center)).toEqual([0, 0]);
    for (const p of [
      [0, 0],
      [9, 7.2],
      [3.3, 5.1],
    ] as [number, number][]) {
      const [x, z] = planToWorld(p, r.center);
      const back = worldToPlan(x, z, r.center);
      expect(back[0]).toBeCloseTo(p[0], 12);
      expect(back[1]).toBeCloseTo(p[1], 12);
    }
  });

  it("床の点から部屋を引ける（家の外は null）", () => {
    const rooms = [...EXAMPLE_ROOMS];
    expect(roomAtPlanPoint(rooms, [1, 6])?.id).toBe("ex-bed");
    expect(roomAtPlanPoint(rooms, [8, 0.5])?.id).toBe("ex-bath");
    expect(roomAtPlanPoint(rooms, [-1, -1])).toBeNull();
  });

  it("台は家より一回り広い", () => {
    const r = build(0);
    const b = plateBounds(r);
    const u = r.union.bbox;
    expect(b.minX).toBeLessThan(u.minX);
    expect(b.minY).toBeLessThan(u.minY);
    expect(b.maxX).toBeGreaterThan(u.maxX);
    expect(b.maxY).toBeGreaterThan(u.maxY);
  });
});

describe("方位記号の矢印", () => {
  for (const north of [0, 37, 90, 180, 270, 311]) {
    it(`記号 ${north} 度: 矢印は真北（方位角 0）を指し、家の外にある`, () => {
      const r = build(north);
      const place = northArrowPlacement(r);
      // three.js に回させて、局所の −z（前）が床のどの向きになるか
      const o = new Object3D();
      o.rotation.y = place.rotationY;
      o.updateMatrixWorld();
      const fwd = new Vector3(0, 0, -1).transformDirection(o.matrixWorld);
      // 床の向き（x, z）→ 図の向き（x, y）は同じ。中心から前へ進んだ点の方位角
      const tip = worldToPlan(fwd.x, fwd.z, r.center);
      const b = bearingOfPlanPoint(tip, r.center, north);
      expect(Math.min(b, 360 - b)).toBeLessThan(1e-6);
      // 置き場所も同じ向きの上で、家の外
      const at = worldToPlan(place.x, place.z, r.center);
      const b2 = bearingOfPlanPoint(at, r.center, north);
      expect(Math.min(b2, 360 - b2)).toBeLessThan(1e-6);
      expect(roomAtPlanPoint([...EXAMPLE_ROOMS], at)).toBeNull();
    });
  }
});
