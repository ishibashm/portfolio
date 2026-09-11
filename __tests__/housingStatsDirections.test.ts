import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_KM,
  DEFAULT_MIN_KM,
  TATAMI_SQM,
  housingStatsByDirection,
  type HousingPoint,
  type HousingStatRow,
} from "@/lib/housingStatsDirections";
import { COMPASS_DIRECTIONS, destinationAtBearing } from "@/utils/directionGeo";

/**
 * 住宅の統計を方位別にまとめる集計。方位の割り当ては
 * `directionFromBearing` に任せているので、見るのは**集計の側**——
 * 距離で切る、空の方位を消さない、円/㎡と月額の目安と空き家率の式、
 * 欠測の扱い——の 4 点。
 */
const BASE_LAT = 35.6812;
const BASE_LON = 139.7671;

let seq = 0;
function town(
  bearing: number,
  km: number,
  stat: Partial<HousingStatRow> = {},
): { row: HousingStatRow; point: HousingPoint } {
  const code = `9${String(++seq).padStart(4, "0")}`;
  const { lat, lon } = destinationAtBearing(BASE_LAT, BASE_LON, bearing, km);
  return {
    row: {
      area_code: code,
      area_name: `町${seq}`,
      total_dwellings: null,
      vacant_dwellings: null,
      rent_per_tatami_yen: null,
      tatami_per_rental: null,
      floor_area_per_rental: null,
      ...stat,
    },
    point: { code, lat, lon },
  };
}

function run(items: { row: HousingStatRow; point: HousingPoint }[]) {
  return housingStatsByDirection(
    items.map((i) => i.row),
    items.map((i) => i.point),
    BASE_LAT,
    BASE_LON,
  );
}

describe("housingStatsByDirection", () => {
  it("8 方位を必ず全部返し、材料の無い方位は count 0", () => {
    const stats = run([town(0, 30, { rent_per_tatami_yen: 3000 })]);
    expect(stats.map((s) => s.direction)).toEqual(COMPASS_DIRECTIONS);
    const north = stats.find((s) => s.direction === "N")!;
    expect(north.count).toBe(1);
    expect(stats.filter((s) => s.count === 0)).toHaveLength(7);
    const empty = stats.find((s) => s.direction === "S")!;
    expect(empty.medianRentPerSqm).toBeNull();
    expect(empty.vacancyRate).toBeNull();
    expect(empty.topMunicipalities).toEqual([]);
  });

  it("近すぎる・遠すぎる市区町村は入れない", () => {
    const stats = run([
      town(90, DEFAULT_MIN_KM - 1, { rent_per_tatami_yen: 9000 }),
      town(90, DEFAULT_MAX_KM + 1, { rent_per_tatami_yen: 9000 }),
      town(90, 40, { rent_per_tatami_yen: 3240 }),
    ]);
    const east = stats.find((s) => s.direction === "E")!;
    expect(east.count).toBe(1);
    expect(east.medianRentPerSqm).toBe(Math.round(3240 / TATAMI_SQM));
  });

  it("円/㎡は 1 畳当たり家賃 ÷ 1.62、月額の目安は × 借家の平均畳数", () => {
    const stats = run([
      town(180, 30, { rent_per_tatami_yen: 3240, tatami_per_rental: 20 }),
    ]);
    const south = stats.find((s) => s.direction === "S")!;
    expect(south.medianRentPerSqm).toBe(2000);
    expect(south.medianMonthlyRentEstimate).toBe(64800);
    expect(south.rentCount).toBe(1);
  });

  it("空き家率は方位内の合計どうしの比（戸数で重み付け）", () => {
    const stats = run([
      town(270, 30, { total_dwellings: 1000, vacant_dwellings: 100 }),
      town(270, 50, { total_dwellings: 3000, vacant_dwellings: 600 }),
      /* 空き家数が欠測の市区町村は空き家率に入れない（count には入る） */
      town(270, 60, { total_dwellings: 500 }),
    ]);
    const west = stats.find((s) => s.direction === "W")!;
    expect(west.count).toBe(3);
    expect(west.vacancyCount).toBe(2);
    expect(west.vacancyRate).toBeCloseTo(700 / 4000, 6);
  });

  it("家賃が欠測の市区町村は円/㎡に入れないが、count と名前には入る", () => {
    const stats = run([
      town(45, 30, { total_dwellings: 800 }),
      town(45, 35, { rent_per_tatami_yen: 1620, total_dwellings: 2000 }),
    ]);
    const ne = stats.find((s) => s.direction === "NE")!;
    expect(ne.count).toBe(2);
    expect(ne.rentCount).toBe(1);
    expect(ne.medianRentPerSqm).toBe(1000);
    /* 総住宅数の多い順 */
    expect(ne.topMunicipalities[0]).toBe(stats && "町" + seq);
  });

  it("代表点の無い市区町村は集計に入らない（落ちない）", () => {
    const t = town(0, 30, { rent_per_tatami_yen: 3000 });
    const stats = housingStatsByDirection([t.row], [], BASE_LAT, BASE_LON);
    expect(stats.every((s) => s.count === 0)).toBe(true);
  });
});
