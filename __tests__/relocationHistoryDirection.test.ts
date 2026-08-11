import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 引越し履歴の方位を、どちらの北で判定するか。
 *
 * この一覧だけが偏角を引いた方位角で判定していた。サイトの他は全て真北で
 * 方位を決めている。
 *
 *   /houi の記事        全国向けの静的ページなので偏角を持てない
 *   物件を方位で探す    direction は真北。磁北は注意喚起にだけ使う
 *   同じファイルの POST 保存時に凍結する判定スナップショットも真北
 *
 * 最後のものが分かりやすい実害で、同じ記録の「保存したときの判定」と
 * 「一覧を開いたときの再評価」が、方位の境目付近で食い違っていた。
 *
 * 真北で判定することと、磁北は注意としてだけ添えることを固定する。
 */

const { denyUnlessAdmin, findMany, getGeomagneticData, readFile } = vi.hoisted(
  () => ({
    denyUnlessAdmin: vi.fn(),
    findMany: vi.fn(),
    getGeomagneticData: vi.fn(),
    readFile: vi.fn(),
  }),
);

vi.mock("@/lib/adminApi", () => ({ denyUnlessAdmin }));
vi.mock("@/lib/prisma", () => ({
  default: { relocationHistory: { findMany } },
}));
vi.mock("@/utils/geomagnetism", () => ({ getGeomagneticData }));
vi.mock("fs/promises", () => ({ default: { readFile } }));

import { GET } from "@/app/api/relocation/history/route";
import { getKigakuSector } from "@/utils/kigakuUtils";

/**
 * 伝統区分は N が 345〜15 度、NE が 15〜75 度、E が 75〜105 度。
 * 偏角は西偏 20 度（磁方位角 = 真方位角 + 20）とし、境目をまたぐ地点と
 * またがない地点の両方を作る。
 *
 *   北寄り 真 3.7 度(N)  → 磁 23.7 度(NE)   分かれる
 *   北東   真 38.6度(NE) → 磁 58.6 度(NE)   分かれない
 */
const FROM = { lat: 35.6812, lon: 139.7671 };
const DECLINATION = -20;

function historyRow(toLat: number, toLon: number) {
  return {
    id: "trip-1",
    userId: null,
    departureDate: new Date("2026-03-10T00:00:00+09:00"),
    datePrecision: "DAY",
    fromName: "東京",
    fromLat: FROM.lat,
    fromLon: FROM.lon,
    toName: "移転先",
    toLat,
    toLon,
    purpose: "MIGRATION",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function callGet(url: string) {
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.success).toBe(true);
  return json.data as {
    bearing: number;
    direction: string;
    magneticBearing: number | null;
    magneticDirection: string | null;
  }[];
}

describe("引越し履歴の方位の基準", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    denyUnlessAdmin.mockResolvedValue(null);
    // 設定ファイルは読めない前提。既定のプロフィールで走る。
    readFile.mockRejectedValue(new Error("no config"));
    getGeomagneticData.mockResolvedValue({ declination: DECLINATION });
  });

  it("判定は真北の方位角から引く（偏角を混ぜない）", async () => {
    // 真北で見て N、磁北で見ると NE に落ちる地点。
    const to = { lat: FROM.lat + 1.0, lon: FROM.lon + 0.08 };
    findMany.mockResolvedValue([historyRow(to.lat, to.lon)]);

    const [row] = await callGet(
      "http://localhost/api/relocation/history?useClassical=true",
    );

    expect(row.direction).toBe(getKigakuSector(row.bearing, true));
    expect(row.direction).toBe("N");
  });

  it("磁北で分かれる記録には、注意として磁北の方位を添える", async () => {
    const to = { lat: FROM.lat + 1.0, lon: FROM.lon + 0.08 };
    findMany.mockResolvedValue([historyRow(to.lat, to.lon)]);

    const [row] = await callGet(
      "http://localhost/api/relocation/history?useClassical=true",
    );

    expect(row.magneticDirection).toBe("NE");
    expect(row.magneticDirection).not.toBe(row.direction);
    // 添えるだけで、判定そのものは真北のまま。
    expect(row.direction).toBe("N");
  });

  it("真北と磁北で同じ方位なら、注意は出さない", async () => {
    // 北東のあたり。NE の幅が 60 度あるので、西偏 20 度でも同じ方位に収まる。
    const to = { lat: FROM.lat + 1.0, lon: FROM.lon + 1.0 };
    findMany.mockResolvedValue([historyRow(to.lat, to.lon)]);

    const [row] = await callGet(
      "http://localhost/api/relocation/history?useClassical=true",
    );

    expect(row.direction).toBe("NE");
    expect(row.magneticDirection).toBeNull();
    expect(row.magneticBearing).toBeNull();
  });

  it("真北で見ると決めている人には偏角を引きにいかない", async () => {
    // use_true_north は設定ファイル側の値。真北で見ると決めているなら、
    // 磁北の注意は要らないので地磁気も引かない（記録ごとの外部呼び出し）。
    readFile.mockResolvedValue(JSON.stringify({ use_true_north: true }));
    const to = { lat: FROM.lat + 1.0, lon: FROM.lon + 0.08 };
    findMany.mockResolvedValue([historyRow(to.lat, to.lon)]);

    const [row] = await callGet(
      "http://localhost/api/relocation/history?useClassical=true",
    );

    expect(getGeomagneticData).not.toHaveBeenCalled();
    expect(row.magneticDirection).toBeNull();
    expect(row.magneticBearing).toBeNull();
    // 判定は真北のまま。設定によって変わらない。
    expect(row.direction).toBe("N");
  });
});
