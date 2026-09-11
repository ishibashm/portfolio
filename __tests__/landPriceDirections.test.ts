import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_KM,
  DEFAULT_MIN_KM,
  landPricesByDirection,
  latestPerPoint,
  type LandPriceRow,
} from "@/lib/landPriceDirections";
import { COMPASS_DIRECTIONS, destinationAtBearing } from "@/utils/directionGeo";

/**
 * 地価公示の地点を方位別にまとめる集計。
 *
 * 方位の割り当ては `directionFromBearing` に任せているので、ここで見るのは
 * **集計の側**——年の重複を落とす、距離で切る、空の方位を消さない、
 * 中央値が正しい——の 4 点。
 */

const BASE_LAT = 35.6812;
const BASE_LON = 139.7671;

/** 出発地から指定の方位角・距離にある地点を作る。 */
function pointAt(
  bearing: number,
  km: number,
  price: number,
  extra: Partial<LandPriceRow> = {},
): LandPriceRow {
  const { lat, lon } = destinationAtBearing(BASE_LAT, BASE_LON, bearing, km);
  return {
    point_id: `${bearing}-${km}-${price}`,
    year: 2025,
    land_price_type: 0,
    price_per_sqm: price,
    lat,
    lon,
    use_category: "住宅地",
    prefecture: "東京都",
    municipality: "千代田区",
    ...extra,
  };
}

describe("latestPerPoint", () => {
  it("同じ地点は新しい年だけ残す", () => {
    const rows: LandPriceRow[] = [
      { ...pointAt(0, 10, 100), point_id: "p1", year: 2024 },
      { ...pointAt(0, 10, 200), point_id: "p1", year: 2025 },
    ];
    const kept = latestPerPoint(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].price_per_sqm).toBe(200);
  });

  it("整理番号が同じでも制度（公示 / 調査）が違えば別の地点として残す", () => {
    /* point_id は制度をまたいで一意である保証が無い。片方がもう片方を
       黙って消すのを防ぐ（schema.prisma の註と同じ理由） */
    const rows: LandPriceRow[] = [
      { ...pointAt(0, 10, 100), point_id: "p1", land_price_type: 0 },
      { ...pointAt(0, 10, 200), point_id: "p1", land_price_type: 1 },
    ];
    expect(latestPerPoint(rows)).toHaveLength(2);
  });
});

describe("landPricesByDirection", () => {
  it("8 方位を必ず全部返す。地点が無い方位も落とさない", () => {
    /* 空の方位を黙って消さない（CLAUDE.md 2-c）。消すと同じ画面の
       他の表と方位の数が食い違う */
    const stats = landPricesByDirection(
      [pointAt(0, 20, 100)],
      BASE_LAT,
      BASE_LON,
    );
    expect(stats).toHaveLength(8);
    expect(stats.map((s) => s.direction)).toEqual(COMPASS_DIRECTIONS);
    const empty = stats.filter((s) => s.count === 0);
    expect(empty).toHaveLength(7);
    for (const s of empty) {
      expect(s.medianPricePerSqm).toBeNull();
      expect(s.nearestKm).toBeNull();
    }
  });

  it("方位角が方位に落ちる（北・東・南西）", () => {
    const stats = landPricesByDirection(
      [pointAt(0, 20, 100), pointAt(90, 20, 200), pointAt(225, 20, 300)],
      BASE_LAT,
      BASE_LON,
    );
    const by = Object.fromEntries(stats.map((s) => [s.direction, s]));
    expect(by.N.count).toBe(1);
    expect(by.E.count).toBe(1);
    expect(by.SW.count).toBe(1);
    expect(by.N.medianPricePerSqm).toBe(100);
    expect(by.E.medianPricePerSqm).toBe(200);
    expect(by.SW.medianPricePerSqm).toBe(300);
  });

  it("近すぎる地点と遠すぎる地点を外す", () => {
    /* 近い側は「方位が定まらない」から外す。遠い側は全国の中央値に
       なってしまうから外す。どちらも別の理由で、同じ数字を流用しない */
    const stats = landPricesByDirection(
      [
        pointAt(0, DEFAULT_MIN_KM - 1, 100),
        pointAt(0, DEFAULT_MAX_KM + 1, 200),
        pointAt(0, 20, 300),
      ],
      BASE_LAT,
      BASE_LON,
    );
    const north = stats.find((s) => s.direction === "N")!;
    expect(north.count).toBe(1);
    expect(north.medianPricePerSqm).toBe(300);
  });

  it("しきい値は呼ぶ側が変えられる", () => {
    const rows = [pointAt(0, 3, 100)];
    expect(
      landPricesByDirection(rows, BASE_LAT, BASE_LON).find(
        (s) => s.direction === "N",
      )!.count,
    ).toBe(0);
    expect(
      landPricesByDirection(rows, BASE_LAT, BASE_LON, { minKm: 1 }).find(
        (s) => s.direction === "N",
      )!.count,
    ).toBe(1);
  });

  it("用途で絞れる", () => {
    const stats = landPricesByDirection(
      [
        pointAt(0, 20, 100, { use_category: "住宅地" }),
        pointAt(0, 21, 900, { use_category: "商業地" }),
      ],
      BASE_LAT,
      BASE_LON,
      { useCategory: "住宅地" },
    );
    const north = stats.find((s) => s.direction === "N")!;
    expect(north.count).toBe(1);
    expect(north.medianPricePerSqm).toBe(100);
  });

  it("中央値と四分位を出し、いちばん近い地点までの距離も返す", () => {
    const rows = [10, 20, 30, 40, 50].map((p, i) =>
      pointAt(0, 10 + i * 5, p * 10000),
    );
    const north = landPricesByDirection(rows, BASE_LAT, BASE_LON).find(
      (s) => s.direction === "N",
    )!;
    expect(north.count).toBe(5);
    expect(north.medianPricePerSqm).toBe(300000);
    expect(north.p25PricePerSqm).toBe(200000);
    expect(north.p75PricePerSqm).toBe(400000);
    expect(north.nearestKm).toBeCloseTo(10, 1);
  });

  it("市区町村を件数の多い順に 3 つまで出す", () => {
    const rows = [
      pointAt(0, 20, 100, { municipality: "A市" }),
      pointAt(0, 21, 100, { municipality: "A市" }),
      pointAt(0, 22, 100, { municipality: "B市" }),
      pointAt(0, 23, 100, { municipality: "C市" }),
      pointAt(0, 24, 100, { municipality: "D市" }),
    ];
    const north = landPricesByDirection(rows, BASE_LAT, BASE_LON).find(
      (s) => s.direction === "N",
    )!;
    expect(north.topMunicipalities).toEqual(["A市", "B市", "C市"]);
  });

  it("壊れた値は数えない（0 円・座標なし）", () => {
    const rows = [
      pointAt(0, 20, 0),
      { ...pointAt(0, 21, 100), lat: NaN },
      pointAt(0, 22, 500),
    ];
    const north = landPricesByDirection(rows, BASE_LAT, BASE_LON).find(
      (s) => s.direction === "N",
    )!;
    expect(north.count).toBe(1);
    expect(north.medianPricePerSqm).toBe(500);
  });
});
