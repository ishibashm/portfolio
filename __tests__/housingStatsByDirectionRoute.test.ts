import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `/api/housing-stats/by-direction` の入口。
 *
 * 集計そのものは `housingStatsDirections.test.ts` が見ているので、ここでは
 * **入口の振る舞い**だけを固定する。
 *
 *   1. 出発地が無いときに既定値へ落とさない（#1100・#1114・#1126 の経路）
 *   2. 最新の調査年だけを読む
 *   3. 8 方位を返し、meta に出典・加工の明記・API のクレジットが入る
 *      （e-Stat の規約。文言は変えない）
 */
const { queryRawUnsafe } = vi.hoisted(() => ({ queryRawUnsafe: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { $queryRawUnsafe: queryRawUnsafe },
}));

import {
  ESTAT_API_CREDIT,
  GET,
} from "@/app/api/housing-stats/by-direction/route";
import { AREAS } from "@/lib/areaContent";

/* 大阪駅。東京を既定にしていたら方位が入れ替わるので、ずれが出る */
const OSAKA = { lat: 34.7024, lon: 135.4959 };

function request(params: string) {
  return new Request(
    `http://test.local/api/housing-stats/by-direction?${params}`,
  );
}

/** 実在する代表点の市区町村に統計を付ける（大阪の周り）。 */
function rowFor(code: string, rent: number, total: number, vacant: number) {
  const a = AREAS.find((x) => x.code === code);
  if (!a) throw new Error(`AREAS に ${code} が無い`);
  return {
    area_code: code,
    area_name: a.city,
    data_year: 2023,
    total_dwellings: total,
    vacant_dwellings: vacant,
    rent_per_tatami_yen: rent,
    tatami_per_rental: 18,
    floor_area_per_rental: 40,
  };
}

describe("/api/housing-stats/by-direction", () => {
  beforeEach(() => {
    queryRawUnsafe.mockReset();
  });

  it("出発地が無ければ 400（既定値に落とさない）", async () => {
    const res = await GET(request("maxKm=100"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BASE_LOCATION_REQUIRED");
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("最新の調査年だけを読み、8 方位と出典・クレジットを返す", async () => {
    /* 京都市中京区（大阪の北東）と神戸市中央区（西） */
    queryRawUnsafe.mockResolvedValue([
      rowFor("26104", 3240, 60000, 6000),
      rowFor("28110", 2430, 80000, 8000),
    ]);
    const res = await GET(
      request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}&maxKm=100`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const sql: string = queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/max\(data_year\)/);
    expect(body.directions).toHaveLength(8);
    expect(body.meta.dataYear).toBe(2023);
    expect(body.meta.municipalitiesScanned).toBe(2);
    expect(body.meta.credit).toBe(ESTAT_API_CREDIT);
    expect(body.meta.source).toContain("を加工して作成");
    expect(body.meta.source).toContain("出典：政府統計の総合窓口(e-Stat)");
    const counted = body.directions.filter(
      (d: { count: number }) => d.count > 0,
    );
    expect(counted.length).toBeGreaterThanOrEqual(1);
  });

  it("DB が落ちたら 500 と自前のコード", async () => {
    queryRawUnsafe.mockRejectedValue(new Error("boom"));
    const res = await GET(request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("HOUSING_STATS_QUERY_FAILED");
  });
});
