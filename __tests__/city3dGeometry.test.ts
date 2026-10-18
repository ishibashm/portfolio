import { describe, it, expect } from "vitest";
import { buildingsGeometry, shape } from "@/lib/city3d/sceneGeometry";
import { footprint } from "@/lib/city3d/features";
const ring = [
  { x: 10, z: -30 },
  { x: 20, z: -30 },
  { x: 20, z: -20 },
  { x: 10, z: -20 },
  { x: 10, z: -30 },
];
describe("建物の立体形状", () => {
  it("全建物を一つに結合し、北を-z、高さを+yにする", () => {
    const b = footprint([ring], 3103)!;
    const g = buildingsGeometry({
      buildings: [
        b,
        { ...b, rings: [ring.map((p) => ({ x: p.x + 100, z: p.z }))] },
      ],
      roads: [],
      rails: [],
      water: [],
      failedTiles: 0,
    })!;
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(45);
    expect(g.boundingBox!.min.z).toBeCloseTo(-30);
    expect(g.boundingBox!.max.x).toBeCloseTo(120);
    expect(g.groups).toHaveLength(0);
    g.dispose();
  });
  it("中庭を穴として保持する", () => {
    expect(
      shape([ring, ring.map((p) => ({ x: p.x / 2, z: p.z / 2 }))]).holes,
    ).toHaveLength(1);
  });
  it("建物が無い場所でも動く", () => {
    expect(
      buildingsGeometry({
        buildings: [],
        roads: [],
        rails: [],
        water: [],
        failedTiles: 0,
      }),
    ).toBeNull();
  });
});
