import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/municipalities-wealth は生年月日が無いとき、**個人の判定を作らない**。
 *
 * 以前は "2000-01-01T12:00" を黙って入れ、2000 年生まれの本命殺・月命殺・
 * 天中殺で全市区町村を塗っていた。さらに metadata.birthDate にその値を
 * 返すので、頁が「未入力なら metadata から埋める」で生年月日欄に写し、
 * 次の検索で tactical_config_v1 と /api/user-config へ架空の生年月日を
 * 保存していた。
 *
 * 見張るのは 2 つ。
 *   1. 生年月日なし → metadata.birthDate は null、hasBirthDate は false、
 *      全件 UNKNOWN / 50 点（個人の凶殺も出生図の加点も付かない）
 *   2. 生年月日あり → hasBirthDate は true で、方位の判定が付く
 */

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { municipalityWealth: { findMany } },
}));

// 偏角は外部 API。ここでは呼ばない
vi.mock("@/utils/geomagnetism", () => ({
  getGeomagneticData: vi.fn().mockResolvedValue({ declination: -8 }),
}));

import { GET } from "@/app/api/municipalities-wealth/route";

const BASE = { lat: 35.6895, lon: 139.6917 };

function request(params: string) {
  return new Request(`http://test.local/api/municipalities-wealth?${params}`);
}

function row(id: string, lat: number, lon: number) {
  return {
    id,
    areaCode: id,
    areaName: `市区町村${id}`,
    prefecture: "東京都",
    lat,
    lon,
    incomePerCapita: 3000000,
    population: 100000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([
    row("1", BASE.lat + 0.9, BASE.lon), // 北 100km
    row("2", BASE.lat, BASE.lon + 1.1), // 東 100km
    row("3", BASE.lat - 0.9, BASE.lon), // 南 100km
    row("4", BASE.lat, BASE.lon - 1.1), // 西 100km
  ]);
});

describe("生年月日が無いとき", () => {
  it("架空の生年月日を入れず、個人の判定を作らない", async () => {
    const res = await GET(
      request(
        `baseLat=${BASE.lat}&baseLon=${BASE.lon}&targetDate=2026-09-06T12:00`,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.metadata.hasBirthDate).toBe(false);
    // 以前は "2000-01-01T03:00:00.000Z" が返っていた
    expect(json.metadata.birthDate).toBeNull();

    for (const m of json.data) {
      expect(m.astrologyStatus).toBe("UNKNOWN");
      expect(m.astrologyScore).toBe(50);
      expect(String(m.astrologyStatus)).not.toMatch(/JUPITER|VENUS|NOISE/);
      // 方位そのものは生年月日と無関係なので付く
      expect(m.direction).toBeTruthy();
    }
  });
});

describe("生年月日があるとき", () => {
  it("hasBirthDate が true で、方位の判定が付く", async () => {
    const res = await GET(
      request(
        `baseLat=${BASE.lat}&baseLon=${BASE.lon}&targetDate=2026-09-06T12:00&birthDate=1990-05-15T12:00`,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.metadata.hasBirthDate).toBe(true);
    expect(json.metadata.birthDate).toBe("1990-05-15T03:00:00.000Z");
    const statuses = json.data.map(
      (m: { astrologyStatus: string }) => m.astrologyStatus,
    );
    expect(statuses.some((s: string) => s !== "UNKNOWN")).toBe(true);
  });
});
