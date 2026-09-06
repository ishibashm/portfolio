import { describe, expect, it, vi } from "vitest";

/**
 * /api/rentals/arbitrage/timeline は本人の生年月日が無いとき、日別の
 * 判定を作らない。
 *
 * 以前は birthDate の空文字が parseSafeDate で**今日**になり、「今日
 * 生まれた人」の本命殺・月命殺・天中殺で 30 日ぶんを塗っていた。一覧 API
 * （rentals/arbitrage）は hasBirthDate を見て個人の判定を止めているので、
 * 同じ物件で一覧は空・カレンダーだけ判定あり、という食い違いだった。
 */

vi.mock("@/utils/geomagnetism", () => ({
  getGeomagneticData: vi.fn().mockResolvedValue({ declination: -8 }),
}));

import { GET } from "@/app/api/rentals/arbitrage/timeline/route";

const BASE = "baseLat=35.6895&baseLon=139.6917";
const PROP = "propLat=36.5&propLon=139.7"; // ほぼ真北 90km

function request(params: string) {
  return new Request(
    `http://test.local/api/rentals/arbitrage/timeline?${params}`,
  );
}

describe("timeline と生年月日", () => {
  it("生年月日が無ければ日別の判定を返さない", async () => {
    const res = await GET(
      request(`range=30days&${BASE}&${PROP}&targetDate=2026-09-06T12:00`),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasBirthDate).toBe(false);
    // 以前は 30 件（今日生まれの人の判定）が返っていた
    expect(json.dateScores).toEqual([]);
    expect(json.members).toEqual([]);
  });

  it("生年月日があれば range ぶんの日別判定を返す", async () => {
    const res = await GET(
      request(
        `range=30days&${BASE}&${PROP}&targetDate=2026-09-06T12:00&birthDate=1990-05-15T12:00`,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasBirthDate).toBe(true);
    expect(json.dateScores.length).toBeGreaterThan(0);
    expect(json.direction).toBe("N");
  });
});
