import { describe, expect, it } from "vitest";
import {
  EXAMPLE_ROOMS,
  SENSITIVITY_DEG,
  bearingOfPlanPoint,
  buildFloorPlan,
  clipToWedge,
  planAngleOfBearing,
  planCenter,
  planUnion,
  polygonArea,
  roomPolygon,
  sectorOfPlanPoint,
  type PlanRoom,
  type Point,
} from "@/lib/floorPlanModel";
import { COMPASS_DIRECTIONS, directionFromBearing } from "@/utils/directionGeo";
import { readFengShui, type Sex } from "@/utils/fengShuiEngine";

/**
 * 間取りから八宅を見る（利用者の依頼「間取り図から八宅を見る3Dも作って」、
 * 2026-10-01）。
 *
 * - 太極は描いた部屋を合わせた形の面積の重心（重なりは 1 回）。外接
 *   四角形の中心も選べる
 * - 区画は 45 度ずつ、判定と同じ境目（directionFromBearing physical）
 * - 部屋を区画で切った面積は、足すと部屋の面積に戻る
 * - 方位記号の向きは「図の角度 − 記号の角度 = 方位角」
 */

const PEOPLE: [number, Sex][] = [
  [1990, "male"], // 坎
  [1990, "female"], // 艮
  [1991, "male"], // 離
  [1991, "female"], // 乾
  [1993, "male"], // 兌
  [1995, "male"], // 坤
  [1996, "male"], // 巽
  [1997, "male"], // 震
];

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: PlanRoom["kind"] = "other",
): PlanRoom => ({ id, kind, name: id, x, y, w, h });

/** 再現できる乱数 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("方位記号と方位角", () => {
  const c: Point = [0, 0];
  it("図の上が北なら、図の上の点は北（0 度）、右は東（90 度）", () => {
    expect(bearingOfPlanPoint([0, -1], c, 0)).toBeCloseTo(0, 9);
    expect(bearingOfPlanPoint([1, 0], c, 0)).toBeCloseTo(90, 9);
    expect(bearingOfPlanPoint([0, 1], c, 0)).toBeCloseTo(180, 9);
    expect(bearingOfPlanPoint([-1, 0], c, 0)).toBeCloseTo(270, 9);
  });

  it("記号が図の右を指す（北が右）なら、図の上は西、図の下は東", () => {
    expect(bearingOfPlanPoint([0, -1], c, 90)).toBeCloseTo(270, 9);
    expect(bearingOfPlanPoint([1, 0], c, 90)).toBeCloseTo(0, 9);
    expect(bearingOfPlanPoint([0, 1], c, 90)).toBeCloseTo(90, 9);
  });

  it("planAngleOfBearing は bearingOfPlanPoint の逆", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const north = r() * 360;
      const b = r() * 360;
      const a = (planAngleOfBearing(b, north) * Math.PI) / 180;
      const back = bearingOfPlanPoint([Math.sin(a), -Math.cos(a)], c, north);
      const diff = Math.abs(((back - b + 540) % 360) - 180);
      expect(diff).toBeLessThan(1e-9);
    }
  });
});

describe("太極（家の中心）", () => {
  it("長方形を敷き詰めた例の間取りは、真ん中", () => {
    const u = planUnion([...EXAMPLE_ROOMS])!;
    expect(u.area).toBeCloseTo(9 * 7.2, 9);
    expect(u.centroid[0]).toBeCloseTo(4.5, 9);
    expect(u.centroid[1]).toBeCloseTo(3.6, 9);
  });

  it("L 字は、面積の重心と外接四角形の中心が分かれる", () => {
    // 4×4 から右下の 2×2 が欠けた L 字（面積 12）
    const rooms = [room("a", 0, 0, 4, 2), room("b", 0, 2, 2, 2)];
    const u = planUnion(rooms)!;
    expect(u.area).toBeCloseTo(12, 9);
    // 重心 = (8*(2,1) + 4*(1,3)) / 12
    expect(u.centroid[0]).toBeCloseTo(20 / 12, 9);
    expect(u.centroid[1]).toBeCloseTo(20 / 12, 9);
    expect(planCenter(u, "bbox")).toEqual([2, 2]);
  });

  it("重なった部屋は面積を 1 回だけ数える", () => {
    const u = planUnion([room("a", 0, 0, 4, 4), room("b", 2, 2, 4, 4)])!;
    expect(u.area).toBeCloseTo(16 + 16 - 4, 9);
    // 対称なので重心は (3, 3)
    expect(u.centroid[0]).toBeCloseTo(3, 9);
    expect(u.centroid[1]).toBeCloseTo(3, 9);
  });

  it("升目で数えた重心と一致する（重なりを含む乱数の間取り）", () => {
    const r = rng(11);
    for (let t = 0; t < 30; t++) {
      const rooms = Array.from({ length: 4 }, (_, i) =>
        room(
          `r${i}`,
          Math.round(r() * 8),
          Math.round(r() * 8),
          1 + Math.round(r() * 5),
          1 + Math.round(r() * 5),
        ),
      );
      const u = planUnion(rooms)!;
      // 0.25 刻みの升で数える（角が整数なので升は丸ごと内か外）
      let a = 0;
      let mx = 0;
      let my = 0;
      for (let x = 0; x < 16; x += 0.25) {
        for (let y = 0; y < 16; y += 0.25) {
          const cx = x + 0.125;
          const cy = y + 0.125;
          if (
            rooms.some(
              (q) => cx > q.x && cx < q.x + q.w && cy > q.y && cy < q.y + q.h,
            )
          ) {
            a += 0.0625;
            mx += 0.0625 * cx;
            my += 0.0625 * cy;
          }
        }
      }
      expect(u.area).toBeCloseTo(a, 9);
      expect(u.centroid[0]).toBeCloseTo(mx / a, 9);
      expect(u.centroid[1]).toBeCloseTo(my / a, 9);
    }
  });

  it("部屋が無ければ何も返さない", () => {
    expect(planUnion([])).toBeNull();
    expect(
      buildFloorPlan(
        { rooms: [], northArrowDeg: 0, centerMethod: "centroid" },
        readFengShui(1990, "male"),
      ),
    ).toBeNull();
  });
});

describe("部屋を区画で切る", () => {
  it("切った面積を足すと部屋の面積に戻る（中心を含む部屋も）", () => {
    const r = rng(3);
    for (let t = 0; t < 200; t++) {
      const north = r() * 360;
      const rooms = Array.from({ length: 5 }, (_, i) =>
        room(`r${i}`, r() * 10, r() * 10, 0.3 + r() * 6, 0.3 + r() * 6),
      );
      const res = buildFloorPlan(
        { rooms, northArrowDeg: north, centerMethod: "centroid" },
        readFengShui(1990, "male"),
      )!;
      for (const rr of res.rooms) {
        const sum = rr.shares.reduce((s, x) => s + x.area, 0);
        expect(sum).toBeCloseTo(rr.area, 6);
        for (const s of rr.shares) {
          expect(polygonArea(s.piece)).toBeCloseTo(s.area, 9);
        }
      }
    }
  });

  it("切った欠片の中の点は、判定と同じ境目でその区画に入る", () => {
    const r = rng(5);
    for (let t = 0; t < 120; t++) {
      const north = r() * 360;
      const rooms = [
        room("a", r() * 6, r() * 6, 1 + r() * 5, 1 + r() * 5),
        room("b", r() * 6, r() * 6, 1 + r() * 5, 1 + r() * 5),
      ];
      const res = buildFloorPlan(
        { rooms, northArrowDeg: north, centerMethod: "centroid" },
        readFengShui(1991, "female"),
      )!;
      for (const rr of res.rooms) {
        for (const s of rr.shares) {
          if (s.area < 1e-3) continue;
          // 欠片の頂点の平均（凸なので内側）
          const p: Point = [
            s.piece.reduce((a, q) => a + q[0], 0) / s.piece.length,
            s.piece.reduce((a, q) => a + q[1], 0) / s.piece.length,
          ];
          const b = bearingOfPlanPoint(p, res.center, north);
          expect(directionFromBearing(b, "physical")).toBe(s.direction);
          expect(sectorOfPlanPoint(p, res.center, north)).toBe(s.direction);
        }
      }
    }
  });

  it("1 つの区画にすっぽり入る部屋は、その区画が 100%", () => {
    const center: Point = [0, 0];
    // 中心から図の上（北）へ離れた小部屋
    const tight = room("n", -0.5, -9, 1, 1);
    const sq = clipToWedge(roomPolygon(tight), center, -22.5, 22.5);
    expect(polygonArea(sq)).toBeCloseTo(1, 9);
    const res = buildFloorPlan(
      {
        rooms: [tight, room("o", -10, -10, 20, 20)],
        northArrowDeg: 0,
        centerMethod: "bbox",
      },
      readFengShui(1990, "male"),
    )!;
    const n = res.rooms.find((x) => x.room.id === "n")!;
    expect(n.main.direction).toBe("N");
    expect(n.main.share).toBeCloseTo(1, 9);
  });

  it("北が右の図では、図の上にある部屋は西", () => {
    const res = buildFloorPlan(
      {
        rooms: [room("up", -0.5, -9, 1, 1), room("o", -10, -10, 20, 20)],
        northArrowDeg: 90,
        centerMethod: "bbox",
      },
      readFengShui(1990, "male"),
    )!;
    expect(res.rooms[0].main.direction).toBe("W");
  });
});

describe("例の間取りと当て方", () => {
  it("どの本命卦でも、部屋ごとの主な区画は同じで、吉凶は表どおり", () => {
    const mains = new Map<string, string>();
    for (const [y, s] of PEOPLE) {
      const reading = readFengShui(y, s);
      const res = buildFloorPlan(
        {
          rooms: [...EXAMPLE_ROOMS],
          northArrowDeg: 0,
          centerMethod: "centroid",
        },
        reading,
      )!;
      for (const rr of res.rooms) {
        const prev = mains.get(rr.room.id);
        if (prev) expect(rr.main.direction).toBe(prev);
        mains.set(rr.room.id, rr.main.direction);
        const d = reading.directions.find(
          (x) => x.direction === rr.main.direction,
        )!;
        expect(rr.main.youxing).toBe(d.youxing);
        expect(rr.main.auspicious).toBe(d.auspicious);
      }
    }
    // 図の上が北の例では、玄関は南東、浴室は北東、寝室は南西
    expect(mains.get("ex-ent")).toBe("SE");
    expect(mains.get("ex-bath")).toBe("NE");
    expect(mains.get("ex-bed")).toBe("SW");
  });

  it("寝室は吉で合う、水回りは凶で合う。居間は当て方を出さない", () => {
    // 1990 年生まれの女性（艮）: 南西は生気（吉）、北東は伏位（吉）
    const res = buildFloorPlan(
      {
        rooms: [...EXAMPLE_ROOMS],
        northArrowDeg: 0,
        centerMethod: "centroid",
      },
      readFengShui(1990, "female"),
    )!;
    const by = (id: string) => res.rooms.find((r) => r.room.id === id)!;
    expect(by("ex-bed").main.youxing).toBe("生気");
    expect(by("ex-bed").fit).toBe("match");
    expect(by("ex-bath").main.youxing).toBe("伏位");
    expect(by("ex-bath").fit).toBe("mismatch");
    expect(by("ex-ldk").fit).toBe("none");
    expect(by("ex-ldk").rule).toBeNull();
    // LD は太極を含む
    expect(by("ex-ldk").containsCenter).toBe(true);
    expect(by("ex-bed").containsCenter).toBe(false);
  });

  it("長方形の間取りでは、中心の取り方で答えが変わらない", () => {
    const res = buildFloorPlan(
      {
        rooms: [...EXAMPLE_ROOMS],
        northArrowDeg: 0,
        centerMethod: "centroid",
      },
      readFengShui(1990, "male"),
    )!;
    expect(res.rooms.every((r) => !r.centerDependent)).toBe(true);
    expect(res.overlaps).toEqual([]);
  });
});

describe("方位記号のずれに弱い部屋", () => {
  it(`境目にまたがる部屋は拾い、区画の真ん中の部屋は拾わない（±${SENSITIVITY_DEG} 度）`, () => {
    const outer = room("o", -10, -10, 20, 20);
    // 北と北東の境目（22.5 度）の上にある小部屋
    const a = (22.5 * Math.PI) / 180;
    const edge = room(
      "edge",
      8 * Math.sin(a) - 0.5,
      -8 * Math.cos(a) - 0.5,
      1,
      1,
    );
    // 境目から 6 度だけ北東に入った部屋（10 度ずれれば北が主になる）
    const b = (28.5 * Math.PI) / 180;
    const near = room(
      "near",
      8 * Math.sin(b) - 0.5,
      -8 * Math.cos(b) - 0.5,
      1,
      1,
    );
    // 北の真ん中
    const mid = room("mid", -0.5, -8.5, 1, 1);
    const res = buildFloorPlan(
      {
        rooms: [outer, edge, near, mid],
        northArrowDeg: 0,
        centerMethod: "bbox",
      },
      readFengShui(1990, "male"),
    )!;
    const by = (id: string) => res.rooms.find((r) => r.room.id === id)!;
    expect(by("edge").sensitive).toBe(true);
    expect(by("near").main.direction).toBe("NE");
    expect(by("near").sensitive).toBe(true);
    expect(by("mid").sensitive).toBe(false);
  });

  it("北が右の図でも同じ（記号の向きを足し引きする向きを取り違えない）", () => {
    // 図の上に置いた部屋 = 西。西と北西の境目（292.5 度）は図の角度 22.5 度
    const outer = room("o", -10, -10, 20, 20);
    const a = (22.5 * Math.PI) / 180;
    const edge = room(
      "edge",
      8 * Math.sin(a) - 0.5,
      -8 * Math.cos(a) - 0.5,
      1,
      1,
    );
    const res = buildFloorPlan(
      { rooms: [outer, edge], northArrowDeg: 90, centerMethod: "bbox" },
      readFengShui(1990, "male"),
    )!;
    const e = res.rooms.find((r) => r.room.id === "edge")!;
    expect(["W", "NW"]).toContain(e.main.direction);
    expect(e.sensitive).toBe(true);
  });
});

describe("8 区画", () => {
  it("区画は 45 度ずつで、遊星は本命卦の表どおり", () => {
    const reading = readFengShui(1997, "male");
    const res = buildFloorPlan(
      {
        rooms: [room("a", 0, 0, 2, 2)],
        northArrowDeg: 30,
        centerMethod: "centroid",
      },
      reading,
    )!;
    expect(res.sectors.map((s) => s.direction)).toEqual([
      ...COMPASS_DIRECTIONS,
    ]);
    for (const s of res.sectors) {
      expect(s.endDeg - s.startDeg).toBeCloseTo(45, 9);
      expect(s.startPlanDeg - s.startDeg).toBeCloseTo(30, 9);
      const d = reading.directions.find((x) => x.direction === s.direction)!;
      expect(s.youxing).toBe(d.youxing);
    }
  });
});
