import { describe, it, expect } from "vitest";
import {
  project,
  unproject,
  tileAt,
  tilePoint,
  coveringTiles,
} from "@/lib/city3d/geo";
import { bearingOfPoint } from "@/lib/threeBoardModel";
import { bearingBetween, COMPASS_DIRECTIONS } from "@/utils/directionGeo";
import {
  buildWedges,
  centroidDirection,
  mountainForBearing,
  polar,
  wedgePoints,
} from "@/lib/city3d/model";
import { TIER_FILL } from "@/utils/tierDisplay";
import {
  parseGeocodeResponse,
  parseJudgeDirectionsResponse,
  parseReverseGeocoder,
  lookupPlateau,
  groundHeight,
} from "@/lib/city3d/parsers";
import {
  BUILDING_HEIGHT,
  convertRings,
  footprint,
} from "@/lib/city3d/features";
const origin = { lat: 35.1709, lon: 136.8815 };
const payload = {
  directions: COMPASS_DIRECTIONS.map((direction) => ({
    direction,
    label: direction,
    tier: "X",
    status: "NOISE_ANKEN",
    yearLayer: "NOISE_ANKEN",
    monthLayer: "SAFE",
    dayLayer: "SAFE",
  })),
  honmeiStar: 1,
  date: "2026-10-18",
  blockedByTenchusatsu: false,
};
const rpc = (value: unknown) => ({
  result: { content: [{ type: "text", text: JSON.stringify(value) }] },
});
describe("街の局所座標とタイル", () => {
  it("東と北の符号、往復変換", () => {
    for (const p of [
      { x: 100, z: 0 },
      { x: 0, z: -100 },
      { x: 400, z: 400 },
    ]) {
      const result = project(unproject(p, origin), origin);
      expect(result.x).toBeCloseTo(p.x, 6);
      expect(result.z).toBeCloseTo(p.z, 6);
    }
    expect(unproject({ x: 100, z: 0 }, origin).lon).toBeGreaterThan(origin.lon);
    expect(unproject({ x: 0, z: -100 }, origin).lat).toBeGreaterThan(
      origin.lat,
    );
  });
  it("方位角は既存の球面計算と0.5度以内で一致", () => {
    for (let a = 0; a < 360; a += 10) {
      const p = polar(a, 400),
        dest = unproject(p, origin);
      const b = bearingBetween(origin.lat, origin.lon, dest.lat, dest.lon);
      const delta = ((bearingOfPoint(p.x, p.z) - b + 540) % 360) - 180;
      expect(Math.abs(delta)).toBeLessThan(0.5);
    }
  });
  it("名古屋駅の中心タイルを含む最大9枚", () => {
    expect(tileAt(origin)).toEqual({ x: 57686, y: 25920, z: 16 });
    const tiles = coveringTiles(origin, 400);
    expect(tiles.length).toBeLessThanOrEqual(9);
    expect(tiles).toContainEqual(tileAt(origin));
    expect(
      tileAt(tilePoint({ x: 2048, y: 2048 }, tileAt(origin), 4096)),
    ).toEqual(tileAt(origin));
  });
  it("東京駅と軽量表示も中心タイルを含む", () => {
    for (const p of [origin, { lat: 35.6812, lon: 139.7671 }]) {
      const tiles = coveringTiles(p, 250);
      expect(tiles).toContainEqual(tileAt(p));
      expect(tiles.length).toBeLessThanOrEqual(9);
    }
  });
});
describe("方位と二十四山", () => {
  it("古典盤の北は0度を跨ぎ、色と呼び名を共有する", () => {
    const wedges = buildWedges(parseJudgeDirectionsResponse(rpc(payload)));
    expect(wedges).toHaveLength(8);
    expect(wedges.find((w) => w.direction === "N")).toMatchObject({
      start: 345,
      end: 375,
      color: TIER_FILL.X,
      status: "暗剣殺",
    });
    expect(centroidDirection(polar(350, 100))).toBe("N");
    expect(centroidDirection(polar(20, 100))).toBe("NE");
  });
  it("各段階の色をそのまま表示", () => {
    for (const tier of Object.keys(TIER_FILL)) {
      const j = parseJudgeDirectionsResponse(
        rpc({
          ...payload,
          directions: payload.directions.map((d) => ({ ...d, tier })),
        }),
      );
      expect(buildWedges(j)[0].color).toBe(
        TIER_FILL[tier as keyof typeof TIER_FILL],
      );
    }
  });
  it("未判定は無彩色の境界のみ", () => {
    expect(buildWedges(null).every((w) => w.color === null)).toBe(true);
    const ps = wedgePoints(345, 375, 100);
    expect(ps[0]).toEqual({ x: 0, z: 0 });
    expect(ps[1].x).toBeLessThan(0);
    expect(ps.at(-1)!.x).toBeGreaterThan(0);
  });
  it.each([
    [0, "子"],
    [352.5, "子"],
    [352.4, "壬"],
    [45, "艮"],
    [180, "午"],
    [225, "坤"],
    [315, "乾"],
    [-360, "子"],
    [720, "子"],
  ])("二十四山の%s度は%s", (angle, name) => {
    expect(mountainForBearing(Number(angle))).toBe(name);
  });
});
describe("外部応答の境界", () => {
  it("位置応答を読み取り、不正値は拒む", () => {
    expect(
      parseGeocodeResponse({ ...origin, name: "名古屋駅", source: "gsi" }),
    ).toMatchObject(origin);
    for (const value of [
      { error: "見つからない" },
      null,
      { ...origin, lat: NaN, name: "名古屋駅", source: "gsi" },
      { ...origin, lon: 200, name: "名古屋駅", source: "gsi" },
    ])
      expect(() => parseGeocodeResponse(value)).toThrow();
  });
  it("MCPの成功応答", () => {
    expect(parseJudgeDirectionsResponse(rpc(payload))).toEqual(payload);
  });
  it.each([
    { result: { isError: true, content: [] } },
    { error: { code: -1, message: "失敗" } },
    { result: { content: [{ text: "壊れたJSON" }] } },
    rpc({}),
    rpc({ ...payload, directions: payload.directions.slice(1) }),
    rpc({
      ...payload,
      directions: payload.directions.map((d) => ({ ...d, tier: "Z" })),
    }),
    rpc({
      ...payload,
      directions: payload.directions.map((d) => ({ ...d, direction: "N" })),
    }),
  ])("失敗・欠損・重複を判定扱いしない", (value) => {
    expect(() => parseJudgeDirectionsResponse(value)).toThrow();
  });
  it("逆ジオコーダー", () => {
    expect(
      parseReverseGeocoder({
        results: { muniCd: "23105", lv01Nm: "名駅一丁目" },
      }),
    ).toBe("23105");
    expect(parseReverseGeocoder({ results: { muniCd: 23105 } })).toBeNull();
    expect(parseReverseGeocoder(null)).toBeNull();
  });
  it("区コードを優先し未知コードはnull", () => {
    const ward = {
        url: "https://example.org/ward/tileset.json",
        year: 2024,
        name: "名古屋市",
      },
      city = { ...ward, url: "https://example.org/city/tileset.json" };
    const index = { "23105": ward, "23100": city };
    expect(
      lookupPlateau(index, { ward_code: "23105", city_code: "23100" }),
    ).toBe(ward);
    expect(lookupPlateau(index, { city_code: "23100" })).toBe(city);
    expect(
      lookupPlateau(index, { ward_code: "00000", city_code: "23100" }),
    ).toBeNull();
  });
  it("地点を含む最深のregionの下端を地面にする", () => {
    const lon = (origin.lon * Math.PI) / 180,
      lat = (origin.lat * Math.PI) / 180;
    const region = (h: number) => ({
      boundingVolume: {
        region: [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01, h, 100],
      },
    });
    const root = {
      ...region(5),
      children: [
        { ...region(12), children: [region(18)] },
        { boundingVolume: { region: [0, 0, 1, 1, 99, 100] } },
      ],
    };
    expect(groundHeight({ root }, origin)).toBe(18);
    expect(groundHeight({ root }, { lat: 0, lon: 90 })).toBe(5);
    expect(groundHeight({}, origin)).toBe(0);
  });
});
describe("建物形状", () => {
  it("タイル座標を局所座標に変換し種別の目安を付ける", () => {
    const tile = tileAt(origin),
      rings = convertRings(
        [
          [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
            { x: 100, y: 200 },
            { x: 100, y: 100 },
          ],
        ],
        tile,
        4096,
        origin,
      );
    expect(rings[0][0]).toEqual(
      project(tilePoint({ x: 100, y: 100 }, tile, 4096), origin),
    );
    for (const [code, height] of Object.entries(BUILDING_HEIGHT)) {
      const b = footprint(rings, Number(code));
      expect(b?.height).toBe(height);
      expect(b?.centroid.x).toBeCloseTo((rings[0][0].x + rings[0][1].x) / 2, 3);
    }
    expect(footprint(rings, 0)).toBeNull();
    expect(footprint([[]], 3101)).toBeNull();
  });
});
