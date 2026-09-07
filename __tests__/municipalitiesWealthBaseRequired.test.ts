import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/municipalities-wealth は出発地が無いとき、**東京に落とさない**。
 *
 * 以前は baseLat / baseLon が無いと東京駅（35.6895, 139.6917）を既定に
 * していた。方位は出発地からの向きで決まるので、大阪の利用者が出発地を
 * まだ入れていない状態で頁を開くと、東京から見た方位で全市区町村が
 * 塗られる。さらに metadata.baseLat にその値を返すので、頁が
 * 「未入力なら metadata から埋める」で出発地欄に写し、次の保存で
 * tactical_config_v1 と /api/user-config へ東京駅を出発地として書いていた
 * （生年月日で起きたのと同じ経路。municipalitiesWealthBirthDate）。
 *
 * 物件検索の API（rentals/arbitrage）と同じ BASE_LOCATION_REQUIRED で断る。
 * 頁は応答の message をそのまま赤帯に出す。
 */

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { municipalityWealth: { findMany } },
}));

vi.mock("@/utils/geomagnetism", () => ({
  getGeomagneticData: vi.fn().mockResolvedValue({ declination: -8 }),
}));

import { GET } from "@/app/api/municipalities-wealth/route";

/* 大阪駅。東京駅から見ると西、ここから見ると市区町村は北・東・南・西 */
const OSAKA = { lat: 34.7024, lon: 135.4959 };

function request(params: string) {
  return new Request(`http://test.local/api/municipalities-wealth?${params}`);
}

function row(id: string, lat: number, lon: number) {
  return {
    id,
    areaCode: id,
    areaName: `市区町村${id}`,
    prefecture: "大阪府",
    lat,
    lon,
    incomePerCapita: 3000000,
    population: 100000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([
    row("1", OSAKA.lat + 0.9, OSAKA.lon), // 大阪から北 100km
  ]);
});

describe("出発地が無いとき", () => {
  it("東京に落とさず 400 で断る。metadata に架空の出発地を返さない", async () => {
    const res = await GET(request("targetDate=2026-09-06T12:00"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("BASE_LOCATION_REQUIRED");
    expect(json.metadata).toBeUndefined();
    // 断るのは DB を引く前
    expect(findMany).not.toHaveBeenCalled();
  });

  it("片方だけでも 400", async () => {
    const res = await GET(
      request(`baseLat=${OSAKA.lat}&targetDate=2026-09-06T12:00`),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("BASE_LOCATION_REQUIRED");
  });
});

describe("出発地があるとき", () => {
  it("その出発地から見た方位で判定する（東京から見た西ではない）", async () => {
    const res = await GET(
      request(
        `baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}&targetDate=2026-09-06T12:00`,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metadata.baseLat).toBe(OSAKA.lat);
    expect(json.data[0].direction).toBe("N");
  });
});
