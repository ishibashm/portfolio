import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ROOM_HALF,
  ROOM_ITEM_SPECS,
  buildRoomModel,
  itemCorners,
  sectorOfPoint,
  sectorPolygon,
  unitOfBearing,
} from "@/lib/fengShuiRoomModel";
import { COMPASS_DIRECTIONS, directionFromBearing } from "@/utils/directionGeo";
import { readFengShui, type Sex } from "@/utils/fengShuiEngine";
import { bearingOfPoint } from "@/lib/threeBoardModel";

/**
 * 八宅の間取り（利用者の依頼「他の 3D モデルのアイデアも」、2026-09-30）。
 *
 * - 区画は家の中心から 45 度ずつ（八宅の区分）。判定と同じ境目
 * - 家具は足元の四隅まで、置いたと言う区画に収まる
 * - 頭・顔・焚き口は、言った方位の中心を向く
 * - 置き先と向き先の遊星は、本命卦の表（readFengShui）そのまま
 */

/** 8 つの本命卦がすべて出る組（年と性別） */
const PEOPLE: [number, Sex][] = [
  [1990, "male"], // 坎
  [1990, "female"], // 艮
  [1991, "male"], // 離
  [1991, "female"], // 乾
  [1992, "male"], // 艮
  [1993, "male"], // 兌
  [1994, "male"], // 乾
  [1995, "male"], // 坤
  [1996, "male"], // 巽
  [1997, "male"], // 震
  [1998, "male"], // 坤
];

function polygonArea(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

describe("床の区画", () => {
  it("8 つの本命卦がすべて試される", () => {
    const guas = new Set(PEOPLE.map(([y, s]) => readFengShui(y, s).gua));
    expect([...guas].sort()).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it("8 つの多角形で床をちょうど覆う（面積の和が床の面積）", () => {
    const total = COMPASS_DIRECTIONS.reduce(
      (s, d) => s + polygonArea(sectorPolygon(d)),
      0,
    );
    expect(total).toBeCloseTo((2 * ROOM_HALF) ** 2, 9);
  });

  it("多角形の頂点は床の縁か中心にあり、境目の頂点は判定の境目", () => {
    for (const d of COMPASS_DIRECTIONS) {
      const poly = sectorPolygon(d);
      expect(poly[0]).toEqual([0, 0]);
      for (const [x, z] of poly.slice(1)) {
        const onEdge =
          Math.abs(Math.abs(x) - ROOM_HALF) < 1e-9 ||
          Math.abs(Math.abs(z) - ROOM_HALF) < 1e-9;
        expect(onEdge, `${d} ${x},${z}`).toBe(true);
      }
      // 最初と最後の縁の点は境目: すぐ内側は d、すぐ外側は隣
      const b0 = bearingOfPoint(...poly[1]);
      const b1 = bearingOfPoint(...poly[poly.length - 1]);
      expect(directionFromBearing(b0 + 0.01, "physical")).toBe(d);
      expect(directionFromBearing(b1 - 0.01, "physical")).toBe(d);
      expect(directionFromBearing(b1 + 0.01, "physical")).not.toBe(d);
    }
  });

  it("床の上の点の区画は、45 度の等分の判定と一致する", () => {
    for (let x = -5.95; x < 6; x += 0.3) {
      for (let z = -5.95; z < 6; z += 0.3) {
        const b = (Math.atan2(x, -z) * 180) / Math.PI;
        expect(sectorOfPoint(x, z)).toBe(directionFromBearing(b, "physical"));
      }
    }
  });
});

describe("家具の置き方", () => {
  it.each(PEOPLE)("%i 年 %s: 四隅まで区画に収まり、遊星は表どおり", (y, s) => {
    const reading = readFengShui(y, s);
    const model = buildRoomModel(reading);
    expect(model.items.map((i) => i.kind)).toEqual(
      ROOM_ITEM_SPECS.map((x) => x.kind),
    );
    const youxingAt = (d: string) =>
      reading.directions.find((x) => x.direction === d)!.youxing;
    for (const [i, item] of model.items.entries()) {
      const spec = ROOM_ITEM_SPECS[i];
      // 置いた区画は、その遊星の方位
      expect(youxingAt(item.sector)).toBe(spec.place);
      expect(item.sectorYouxing).toBe(spec.place);
      // 足元の四隅と中心がその区画
      expect(sectorOfPoint(item.x, item.z)).toBe(item.sector);
      for (const [cx, cz] of itemCorners(item)) {
        expect(sectorOfPoint(cx, cz), `${item.name} ${cx},${cz}`).toBe(
          item.sector,
        );
        expect(Math.abs(cx)).toBeLessThan(ROOM_HALF);
        expect(Math.abs(cz)).toBeLessThan(ROOM_HALF);
      }
      // 向きは、その遊星の方位の中心
      if (spec.face) {
        expect(item.facing).not.toBeNull();
        expect(youxingAt(item.facing!)).toBe(spec.face);
        expect(directionFromBearing(item.facingDeg, "physical")).toBe(
          item.facing,
        );
        expect(item.facingDeg % 45).toBe(0);
      } else {
        expect(item.facing).toBeNull();
      }
    }
    // 家具どうしは別の区画（同じ区画に重ねない）
    expect(new Set(model.items.map((i) => i.sector)).size).toBe(4);
  });

  it("吉の区画に置くものは吉、凶の区画に置くものは凶", () => {
    for (const [y, s] of PEOPLE) {
      const model = buildRoomModel(readFengShui(y, s));
      const sec = (d: string) => model.sectors.find((x) => x.direction === d)!;
      const byKind = Object.fromEntries(model.items.map((i) => [i.kind, i]));
      expect(sec(byKind.bed.sector).auspicious).toBe(true);
      expect(sec(byKind.desk.sector).auspicious).toBe(true);
      expect(sec(byKind.stove.sector).auspicious).toBe(false);
      expect(sec(byKind.bath.sector).auspicious).toBe(false);
      // 坐凶向吉: 焚き口は吉の方位
      expect(sec(byKind.stove.facing!).auspicious).toBe(true);
    }
  });

  it("前の向き: 方位角 0 は北（−z）、90 は東（+x）", () => {
    const [nx, nz] = unitOfBearing(0);
    expect(nx).toBeCloseTo(0, 12);
    expect(nz).toBeCloseTo(-1, 12);
    const [ex, ez] = unitOfBearing(90);
    expect(ex).toBeCloseTo(1, 12);
    expect(ez).toBeCloseTo(0, 12);
    // 四隅の前の 2 つは、中心より前の向きへ出ている
    const c = itemCorners({ x: 0, z: 0, w: 1, d: 2, facingDeg: 90 });
    expect(c[0][0]).toBeCloseTo(1, 12);
    expect(c[1][0]).toBeCloseTo(1, 12);
    expect(c[2][0]).toBeCloseTo(-1, 12);
  });
});

describe("バンドルの重さ", () => {
  it("暦も判定エンジンも値として読まない", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/fengShuiRoomModel.ts"),
      "utf8",
    ).replace(/import type[^;]+;/g, "");
    expect(src).not.toMatch(/from "@\/utils\/ephemerisEngine"/);
    expect(src).not.toMatch(/from "@\/utils\/auspiciousDays"/);
    expect(src).not.toMatch(/from "@\/utils\/honmeiYear"/);
    expect(src).not.toMatch(/from "@\/utils\/fengShuiEngine"/);
  });
});
