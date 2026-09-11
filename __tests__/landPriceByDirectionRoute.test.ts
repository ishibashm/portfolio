import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `/api/land-prices/by-direction` の入口。
 *
 * 集計そのものは `landPriceDirections.test.ts` が見ているので、ここでは
 * **入口の振る舞い**だけを固定する。
 *
 *   1. 出発地が無いときに既定値へ落とさない（#1100・#1114・#1126 の経路）
 *   2. 矩形で絞ってから渡す（全国を毎回 JS に載せない）
 *   3. 8 方位を返す
 */

const { queryRawUnsafe } = vi.hoisted(() => ({ queryRawUnsafe: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { $queryRawUnsafe: queryRawUnsafe },
}));

import { GET } from "@/app/api/land-prices/by-direction/route";
import { destinationAtBearing } from "@/utils/directionGeo";

/* 大阪駅。東京を既定にしていたら方位が入れ替わるので、ずれが出る */
const OSAKA = { lat: 34.7024, lon: 135.4959 };

function request(params: string) {
  return new Request(
    `http://test.local/api/land-prices/by-direction?${params}`,
  );
}

function point(bearing: number, km: number, price: number) {
  const { lat, lon } = destinationAtBearing(OSAKA.lat, OSAKA.lon, bearing, km);
  return {
    point_id: `${bearing}-${km}`,
    year: 2025,
    land_price_type: 0,
    price_per_sqm: price,
    lat,
    lon,
    use_category: "住宅地",
    prefecture: "大阪府",
    municipality: "吹田市",
  };
}

beforeEach(() => {
  queryRawUnsafe.mockReset();
});

describe("出発地が無いときは断る", () => {
  it("座標が無ければ 400 で BASE_LOCATION_REQUIRED", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BASE_LOCATION_REQUIRED");
    /* 既定値に落として黙って答えない。DB も引かない */
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("数値でない座標も断る", async () => {
    const res = await GET(request("baseLat=abc&baseLon=135"));
    expect(res.status).toBe(400);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("矩形で絞ってから集計に渡す", () => {
  it("maxKm から緯度経度の幅を出して SQL に渡す", async () => {
    queryRawUnsafe.mockResolvedValue([]);
    await GET(request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}&maxKm=111`));
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [, minLat, maxLat, minLon, maxLon] = queryRawUnsafe.mock.calls[0];
    /* 111km ≒ 緯度 1 度 */
    expect(maxLat - minLat).toBeCloseTo(2, 1);
    /* 経度は緯度で縮むので、同じ km なら度は大きくなる */
    expect(maxLon - minLon).toBeGreaterThan(maxLat - minLat);
    expect(minLat).toBeLessThan(OSAKA.lat);
    expect(maxLat).toBeGreaterThan(OSAKA.lat);
  });

  it("maxKm は上限と下限で挟む（全国を引かせない）", async () => {
    queryRawUnsafe.mockResolvedValue([]);
    await GET(request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}&maxKm=99999`));
    const [, minLat, maxLat] = queryRawUnsafe.mock.calls[0];
    /* 500km で頭打ち。日本列島全体を 1 回で引かない */
    expect((maxLat - minLat) * 111).toBeLessThanOrEqual(1001);
  });
});

describe("返すもの", () => {
  it("8 方位ぶんと、何を見たかの覚書を返す", async () => {
    queryRawUnsafe.mockResolvedValue([
      point(0, 20, 100000),
      point(90, 20, 200000),
    ]);
    const res = await GET(request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.directions).toHaveLength(8);
    const north = body.directions.find(
      (d: { direction: string }) => d.direction === "N",
    );
    expect(north.count).toBe(1);
    expect(north.medianPricePerSqm).toBe(100000);
    expect(body.meta.pointsScanned).toBe(2);
    expect(body.meta.source).toContain("不動産情報ライブラリ");
  });

  it("DB が落ちても 500 を返して例外を漏らさない", async () => {
    queryRawUnsafe.mockRejectedValue(new Error("boom"));
    const res = await GET(request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("LAND_PRICE_QUERY_FAILED");
  });
});
