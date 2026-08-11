import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 書き出しの目的地評価を、どちらの北で判定するか。
 *
 * targetDirName = useTrueNorth ? trueDirection : magneticDirection となって
 * おり、既定（磁北）では偏角を引いた方位で吉凶を引いていた。サイトの他は
 * 全て真北で判定している（記事・物件検索・履歴・シミュレータ）。
 *
 * 真北に揃えたので、北の設定を変えても判定が動かないことを固定する。
 * 方位そのもの（trueDirection / magneticDirection）と偏角は heading に
 * 残したままなので、方位磁針で測るとどう見えるかは書き出しから読める。
 */

const { getUser, getGeomagneticData, readFile, prismaMock } = vi.hoisted(() => {
  const emptyModel = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    getUser: vi.fn(),
    getGeomagneticData: vi.fn(),
    readFile: vi.fn(),
    prismaMock: {
      relocationHistory: emptyModel(),
      timingAstrology: emptyModel(),
      metaphysicalStateLog: emptyModel(),
      knowledgeDocument: emptyModel(),
      telemetryLog: emptyModel(),
    },
  };
});

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/utils/geomagnetism", () => ({ getGeomagneticData }));
vi.mock("fs/promises", () => ({ default: { readFile } }));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { GET } from "@/app/api/relocation/export/route";

const ADMIN = "owner@example.com";

/** 東京起点。真北で N、西偏 20 度で見ると NE に落ちる目的地。 */
const BASE = { lat: 35.6812, lon: 139.7671 };
const TARGET = { lat: 36.6812, lon: 139.8471 };
const DECLINATION = -20;

function exportUrl(useTrueNorth: boolean) {
  const p = new URLSearchParams({
    use_classical: "true",
    use_true_north: String(useTrueNorth),
    base_lat: String(BASE.lat),
    base_lon: String(BASE.lon),
    target_lat: String(TARGET.lat),
    target_lon: String(TARGET.lon),
  });
  return `http://localhost/api/relocation/export?${p}`;
}

async function callExport(useTrueNorth: boolean) {
  const response = await GET(new Request(exportUrl(useTrueNorth)));
  expect(response.status).toBe(200);
  const json = await response.json();
  return json;
}

describe("書き出しの目的地評価の方位基準", () => {
  const originalAdmin = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = ADMIN;
    getUser.mockResolvedValue({
      data: { user: { email: ADMIN, id: "admin-1" } },
      error: null,
    });
    readFile.mockRejectedValue(new Error("no config"));
    getGeomagneticData.mockResolvedValue({ declination: DECLINATION });
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalAdmin;
  });

  it("真北と磁北で方位が分かれる目的地を選んでいる（テストが空回りしない）", async () => {
    const json = await callExport(false);
    const heading = json?.targetEvaluation?.heading;

    expect(heading).toBeTruthy();
    expect(heading.trueDirection).not.toBe(heading.magneticDirection);
    // 偏角と両方の方位は書き出しに残る。
    expect(heading.declination).toBe(DECLINATION);
    expect(heading.trueBearing).toBeTypeOf("number");
    expect(heading.magneticBearing).toBeTypeOf("number");
  });

  it("北の設定を変えても目的地の吉凶は変わらない", async () => {
    const magnetic = await callExport(false);
    const trueNorth = await callExport(true);

    const a = magnetic?.targetEvaluation?.targetStatuses;
    const b = trueNorth?.targetEvaluation?.targetStatuses;

    expect(a).toBeTruthy();
    expect(a).toEqual(b);
  });
});
