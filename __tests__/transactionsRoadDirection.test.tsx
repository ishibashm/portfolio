import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 成約価格を「前面道路の方位」で絞れること（利用者の依頼、2026-09-24
 * 「前面道路の方位も取り込めるようにして」）。
 *
 * 取り込み（#1523）と全国の取り直し（2026-09-25、run 36147445420）で
 * road_direction が入った。probe（run 36151475015）では宅地(土地と建物)
 * の 94.8%、宅地(土地) の 100% に値があり、綴りは北〜北西の 8 つと
 * 「接面道路無」。マンション・農地・林地は値が無い。
 *
 * 家の方位（出発地から見た向き）とは別の軸。
 */

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: { property_transactions: { findMany, count } },
}));

import { GET } from "@/app/api/relocation/transactions/route";
import { TransactionsPanel } from "@/components/relocation/TransactionsPanel";

/** 札幌市中央区の区役所あたり（公開の代表点）。 */
const BASE = { lat: 43.0618, lon: 141.3545 };

const ROW = {
  id: "r1",
  prefecture: "北海道",
  municipality: "札幌市",
  district_name: null,
  property_type: "宅地(土地)",
  trade_price: BigInt(20_000_000),
  area_sqm: 200,
  unit_price_sqm: 100_000,
  building_year: null,
  total_floor_area_sqm: null,
  est_building_price: null,
  est_land_price: null,
  building_ratio: null,
  road_direction: "南",
  road_classification: "市道",
  road_breadth_m: 6,
  trade_year: 2025,
  trade_quarter: 4,
  lat: BASE.lat,
  lon: BASE.lon + 0.12,
};

function req(params: string) {
  return new Request(
    `http://test.local/api/relocation/transactions?lat=${BASE.lat}&lon=${BASE.lon}&radius_km=50&${params}`,
  );
}

describe("API: 前面道路の方位", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([ROW]);
  });

  it("指定した方位を where に入れる", async () => {
    await GET(req(`road_direction=${encodeURIComponent("南")}`) as never);
    expect(findMany.mock.calls[0][0].where.road_direction).toBe("南");
  });

  it("「接面道路無」も受ける", async () => {
    await GET(
      req(`road_direction=${encodeURIComponent("接面道路無")}`) as never,
    );
    expect(findMany.mock.calls[0][0].where.road_direction).toBe("接面道路無");
  });

  it("知らない値は無視する（where に入れない）", async () => {
    await GET(req(`road_direction=${encodeURIComponent("南向き")}`) as never);
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty(
      "road_direction",
    );
  });

  it("一覧の行に前面道路の 3 項目を返す", async () => {
    const res = await GET(req("") as never);
    const body = await res.json();
    expect(body.data.rows[0]).toMatchObject({
      roadDirection: "南",
      roadClassification: "市道",
      roadBreadthM: 6,
    });
  });
});

describe("画面: 前面道路の方位", () => {
  let urls: string[];
  beforeEach(() => {
    urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              rows: [
                {
                  id: "r1",
                  prefecture: "北海道",
                  municipality: "札幌市",
                  districtName: null,
                  propertyType: "宅地(土地)",
                  tradePrice: 20_000_000,
                  areaSqm: 200,
                  unitPriceSqm: 100_000,
                  buildingYear: null,
                  totalFloorAreaSqm: null,
                  estBuildingPrice: null,
                  estLandPrice: null,
                  buildingRatio: null,
                  roadDirection: "南",
                  roadClassification: "市道",
                  roadBreadthM: 6,
                  tradeYear: 2025,
                  tradeQuarter: 4,
                  distanceKm: 10,
                  direction: "E",
                },
              ],
              totalInRadius: 1,
              truncated: false,
              pendingCoords: 0,
              byDirection: [
                { direction: "E", count: 1, medianUnitPriceSqm: 100000 },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("選ぶと URL に載り、行に前面道路が出る", async () => {
    render(
      <TransactionsPanel
        lat={BASE.lat}
        lon={BASE.lon}
        radiusKm={50}
        hasBase={true}
        nodeMapping="traditional"
      />,
    );
    expect(await screen.findByText(/前面道路 南・市道 6m/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("前面道路の方位"), {
      target: { value: "南" },
    });
    await waitFor(() =>
      expect(urls.some((u) => u.includes("road_direction=%E5%8D%97"))).toBe(
        true,
      ),
    );
    expect(screen.getByText(/家から見た方位とは別/)).toBeTruthy();
  });
});
