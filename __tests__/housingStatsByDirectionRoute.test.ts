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

import { GET } from "@/app/api/housing-stats/by-direction/route";
import { ESTAT_API_CREDIT } from "@/lib/estatCredit";
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

  /*
    方位の切り方（nodeMapping）。

    ここは長らく集計側の決め打ち（traditional）だった。物件一覧
    （api/rentals/arbitrage）は古典盤なら traditional、独自モデルなら
    physical で切るので、**独自モデルの利用者は同じ画面で 2 通りの方位
    割り当てを見ていた**（#1297 で lib 側を直し、ここで入口を繋ぐ）。

    実物で確かめた例（大阪駅から）:

      27203 大阪府豊中市        8.9km  方位角 344.9  trad=NW  phys=N
      29203 奈良県大和郡山市   26.4km  方位角 106.3  trad=SE  phys=E
      27202 大阪府岸和田市     28.2km  方位角 199.4  trad=SW  phys=S

    100km 以内だけで 29 市区町村が規則によって方位を変える。
  */
  describe("方位の切り方", () => {
    /** その市区町村が入った方位を 1 つ返す。 */
    async function directionOf(code: string, params = "") {
      queryRawUnsafe.mockResolvedValue([rowFor(code, 3240, 60000, 6000)]);
      const res = await GET(
        request(`baseLat=${OSAKA.lat}&baseLon=${OSAKA.lon}&maxKm=100${params}`),
      );
      const body = await res.json();
      const hit = body.directions.find((d: { count: number }) => d.count === 1);
      return { direction: hit?.direction as string, meta: body.meta };
    }

    it("渡さないときは今までどおり（伝統区分）", async () => {
      expect((await directionOf("27203")).direction).toBe("NW");
      expect((await directionOf("29203")).direction).toBe("SE");
      expect((await directionOf("27202")).direction).toBe("SW");
    });

    it("physical を渡すと 45 度等分になる（決め打ちに戻すと落ちる）", async () => {
      const p = "&nodeMapping=physical";
      expect((await directionOf("27203", p)).direction).toBe("N");
      expect((await directionOf("29203", p)).direction).toBe("E");
      expect((await directionOf("27202", p)).direction).toBe("S");
    });

    it("空回りしていない: 3 件とも規則で答えが割れる", async () => {
      for (const code of ["27203", "29203", "27202"]) {
        const t = await directionOf(code);
        const ph = await directionOf(code, "&nodeMapping=physical");
        expect(t.direction, code).not.toBe(ph.direction);
      }
    });

    it("知らない値は既定に倒す（綴り違いを黙って physical にしない）", async () => {
      /* `as` で押し通していると "phys" がそのまま渡り、
         directionFromBearing の physical 以外＝traditional に落ちるので
         たまたま同じ答えになる。meta で「何で切ったか」まで見る */
      for (const bad of ["phys", "PHYSICAL", "", "1", "traditional "]) {
        const r = await directionOf("27203", `&nodeMapping=${bad}`);
        expect(r.direction, bad).toBe("NW");
        expect(r.meta.nodeMapping, bad).toBe("traditional");
      }
    });

    it("何で切ったかを meta で返す", async () => {
      expect((await directionOf("27203")).meta.nodeMapping).toBe("traditional");
      expect(
        (await directionOf("27203", "&nodeMapping=physical")).meta.nodeMapping,
      ).toBe("physical");
    });
  });
});
