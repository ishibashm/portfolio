import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fixturesForRoom,
  northArrowPlacement,
  plateBounds,
  planToWorld,
  roomAtPlanPoint,
  worldToPlan,
} from "@/components/houi/FloorPlanScene";
import {
  EXAMPLE_ROOMS,
  ROOM_KIND_LABELS,
  bearingOfPlanPoint,
  buildFloorPlan,
} from "@/lib/floorPlanModel";
import { readFengShui } from "@/utils/fengShuiEngine";
import type { PlanRoom, PlanRoomKind } from "@/lib/floorPlanModel";

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

describe("パースの家具・設備", () => {
  /** 再現できる乱数 */
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const kinds = Object.keys(ROOM_KIND_LABELS) as PlanRoomKind[];

  it("どの種類・大きさの部屋でも、家具は部屋の内側に収まる", () => {
    for (let i = 0; i < 2000; i++) {
      const room: PlanRoom = {
        id: `r${i}`,
        kind: kinds[i % kinds.length],
        name: "",
        x: rnd() * 10,
        y: rnd() * 10,
        w: 0.2 + rnd() * 6,
        h: 0.2 + rnd() * 6,
      };
      for (const f of fixturesForRoom(room)) {
        expect(f.w).toBeGreaterThan(0);
        expect(f.d).toBeGreaterThan(0);
        expect(f.z1).toBeGreaterThan(f.z0);
        expect(f.x).toBeGreaterThanOrEqual(room.x - 1e-9);
        expect(f.y).toBeGreaterThanOrEqual(room.y - 1e-9);
        expect(f.x + f.w).toBeLessThanOrEqual(room.x + room.w + 1e-9);
        expect(f.y + f.d).toBeLessThanOrEqual(room.y + room.h + 1e-9);
        // 天井（2.4 m）より低い
        expect(f.z1).toBeLessThanOrEqual(2.4);
      }
    }
  });

  it("例の間取りでは、種類ごとに置くものが決まっている", () => {
    const kindsOf = (id: string) =>
      fixturesForRoom(EXAMPLE_ROOMS.find((r) => r.id === id)!).map(
        (f) => f.kind,
      );
    expect(kindsOf("ex-bed")).toContain("bed");
    expect(kindsOf("ex-study")).toContain("desk");
    expect(kindsOf("ex-kit")).toEqual(["counter", "sink", "cooktop"]);
    expect(kindsOf("ex-bath")).toContain("tub");
    expect(kindsOf("ex-wc")).toContain("bowl");
    expect(kindsOf("ex-ent")).toContain("shoes");
    expect(kindsOf("ex-ldk")).toContain("sofa");
    expect(kindsOf("ex-hall")).toEqual([]);
  });
});

describe("書き出しは端末の中だけ", () => {
  it("立体と画面のコードに、外へ出す・残す経路が無い", () => {
    for (const file of [
      "src/components/houi/FloorPlanScene.tsx",
      "src/components/houi/FloorPlanFengShui.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      for (const w of [
        "fetch(",
        "XMLHttpRequest",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "sendBeacon",
        "FormData",
        "WebSocket",
      ]) {
        expect(src.includes(w), `${file}: ${w}`).toBe(false);
      }
    }
  });
});
