import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/relocation/transactions（成約事例の読み口）。
 *
 * 守るのは 4 つ。
 *   1. lat / lon が無ければ 400。DB には触らない
 *   2. trade_price の BigInt を Number に落とす（落とさないと
 *      JSON.stringify が TypeError で 500 になる）
 *   3. 方位は出発地からの真北基準で付き、半径の外の行は返さない
 *   4. 座標が未整備の行は黙って消さず、pendingCoords で件数を返す
 */

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    property_transactions: { findMany, count },
  },
}));

import { GET } from "@/app/api/relocation/transactions/route";

const BASE = { lat: 35.6895, lon: 139.6917 };

function makeRow(over: Record<string, unknown>) {
  return {
    id: "26100|x|1",
    prefecture: "東京都",
    municipality: "新宿区",
    district_name: "西新宿",
    property_type: "中古マンション等",
    trade_price: BigInt(50000000),
    area_sqm: 50,
    unit_price_sqm: 1000000,
    building_year: 2010,
    trade_year: 2025,
    trade_quarter: 4,
    lat: BASE.lat + 0.09, // ほぼ真北へ 10km
    lon: BASE.lon,
    ...over,
  };
}

function request(params: string) {
  return new Request(`http://test.local/api/relocation/transactions?${params}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(0);
});

describe("relocation transactions API", () => {
  it("lat / lon が無ければ 400。DB には触らない", async () => {
    const res = await GET(request("radius_km=50"));
    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("方位と距離を付けて返す。BigInt は Number に落ちる", async () => {
    findMany.mockResolvedValue([
      makeRow({}),
      makeRow({
        id: "26100|x|2",
        // ほぼ真東へ 10km
        lat: BASE.lat,
        lon: BASE.lon + 0.11,
        unit_price_sqm: 500000,
      }),
    ]);
    count.mockResolvedValue(7);

    const res = await GET(
      request(`lat=${BASE.lat}&lon=${BASE.lon}&radius_km=50`),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.rows).toHaveLength(2);
    expect(data.rows[0].tradePrice).toBe(50000000);
    expect(data.rows[0].direction).toBe("N");
    expect(data.rows[1].direction).toBe("E");
    expect(data.rows[0].distanceKm).toBeGreaterThan(5);
    expect(data.rows[0].distanceKm).toBeLessThan(15);
    expect(data.pendingCoords).toBe(7);
  });

  it("半径の外の行は返さない（粗い箱を通っても正確な距離で切る)", async () => {
    findMany.mockResolvedValue([
      makeRow({}),
      // 箱の角: 北東へ latDelta/lonDelta ぎりぎり（直線距離では半径の外）
      makeRow({
        id: "26100|x|3",
        lat: BASE.lat + 0.44,
        lon: BASE.lon + 0.54,
      }),
    ]);

    const res = await GET(
      request(`lat=${BASE.lat}&lon=${BASE.lon}&radius_km=50`),
    );
    const { data } = await res.json();
    expect(data.rows.map((r: { id: string }) => r.id)).toEqual(["26100|x|1"]);
  });

  it("方位別の相場は中央値で返す", async () => {
    findMany.mockResolvedValue([
      makeRow({ unit_price_sqm: 100 }),
      makeRow({ id: "a", unit_price_sqm: 900 }),
      makeRow({ id: "b", unit_price_sqm: 500 }),
    ]);

    const res = await GET(request(`lat=${BASE.lat}&lon=${BASE.lon}`));
    const { data } = await res.json();
    const north = data.byDirection.find(
      (d: { direction: string }) => d.direction === "N",
    );
    expect(north.count).toBe(3);
    expect(north.medianUnitPriceSqm).toBe(500);
  });

  it("limit を超えたら truncated を立てて頭から切る", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => makeRow({ id: `t${i}` })),
    );

    const res = await GET(request(`lat=${BASE.lat}&lon=${BASE.lon}&limit=3`));
    const { data } = await res.json();
    expect(data.rows).toHaveLength(3);
    expect(data.totalInRadius).toBe(5);
    expect(data.truncated).toBe(true);
  });
});
