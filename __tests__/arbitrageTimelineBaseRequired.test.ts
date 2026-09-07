import { describe, expect, it, vi } from "vitest";

/**
 * /api/rentals/arbitrage/timeline は出発地が無いと判定しない。
 *
 * 以前は baseLat / baseLon が無いと東京駅（35.6895, 139.6917）に黙って
 * 落ちていた。方位は出発地からの向きで決まるので、大阪の利用者が
 * 出発地を渡し忘れると**東京から見た方位**の日別判定が返る。一覧 API
 * （rentals/arbitrage）は同じ場合を BASE_LOCATION_REQUIRED の 400 で
 * 断っているのに、カレンダー側だけ答えを出す食い違いだった。
 */

vi.mock("@/utils/geomagnetism", () => ({
  getGeomagneticData: vi.fn().mockResolvedValue({ declination: -8 }),
}));

import { GET } from "@/app/api/rentals/arbitrage/timeline/route";

const PROP = "propLat=36.5&propLon=139.7";
const BIRTH = "birthDate=1990-05-15T12:00";

function request(params: string) {
  return new Request(
    `http://test.local/api/rentals/arbitrage/timeline?${params}`,
  );
}

describe("timeline と出発地", () => {
  it("出発地が無ければ 400（東京に落とさない）", async () => {
    const res = await GET(
      request(`range=30days&${PROP}&targetDate=2026-09-06T12:00&${BIRTH}`),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    // 一覧 API と同じコード。画面側が同じ分岐で拾える
    expect(json.error).toBe("BASE_LOCATION_REQUIRED");
    expect(json.dateScores).toBeUndefined();
  });

  it("出発地が数値でなくても 400", async () => {
    const res = await GET(
      request(
        `range=30days&baseLat=abc&baseLon=&${PROP}&targetDate=2026-09-06T12:00&${BIRTH}`,
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("BASE_LOCATION_REQUIRED");
  });

  it("出発地があれば、その出発地から見た方位で判定する", async () => {
    // 大阪駅から見て東北東〜北東（東京駅の真北 90km とは別の答え）
    const res = await GET(
      request(
        `range=30days&baseLat=34.7024&baseLon=135.4959&${PROP}&targetDate=2026-09-06T12:00&${BIRTH}`,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.direction).toBe("NE");
  });
});
