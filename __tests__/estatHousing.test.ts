import { describe, expect, it } from "vitest";
import {
  HOUSING_ITEMS,
  aggregateHousing,
  isMunicipalityCode,
  parseEstatValue,
} from "../scripts/estatHousing";
import type { EstatStatsResponse } from "../scripts/estatWealth";

/**
 * e-Stat のＨ 居住（0000020108）の読み方。
 *
 * scripts は tsc の対象外で、実行には ESTAT_APP_ID と外への通信が要る。
 * 集計の部分だけをここで固定する（estatWealth.test.ts と同じ）。
 * 項目コードは探索（run 34649544727）で実物を見たもの。
 */
function response(
  values: { area: string; cat: string; value: string }[],
  areas: { code: string; name: string }[],
): EstatStatsResponse {
  return {
    GET_STATS_DATA: {
      RESULT: { STATUS: 0 },
      STATISTICAL_DATA: {
        DATA_INF: {
          VALUE: values.map((v) => ({
            "@area": v.area,
            "@cat01": v.cat,
            $: v.value,
          })),
        },
        CLASS_INF: {
          CLASS_OBJ: [
            { "@id": "cat01", CLASS: [] },
            {
              "@id": "area",
              CLASS: areas.map((a) => ({ "@code": a.code, "@name": a.name })),
            },
          ],
        },
      },
    },
  };
}

describe("parseEstatValue", () => {
  it("欠測は null、0 は 0、桁区切りは外す", () => {
    expect(parseEstatValue("-")).toBeNull();
    expect(parseEstatValue("***")).toBeNull();
    expect(parseEstatValue("")).toBeNull();
    expect(parseEstatValue(undefined)).toBeNull();
    expect(parseEstatValue("0")).toBe(0);
    expect(parseEstatValue("1,234")).toBe(1234);
    expect(parseEstatValue("2,850.5")).toBe(2850.5);
  });
});

describe("isMunicipalityCode", () => {
  it("全国・都道府県の合計は市区町村ではない", () => {
    expect(isMunicipalityCode("00000")).toBe(false);
    expect(isMunicipalityCode("13000")).toBe(false);
    expect(isMunicipalityCode("13101")).toBe(true);
    expect(isMunicipalityCode("27127")).toBe(true);
    expect(isMunicipalityCode("1310")).toBe(false);
  });
});

describe("aggregateHousing", () => {
  it("5 項目を市区町村ごとに 1 行にまとめ、都道府県の行は落とす", () => {
    const rows = aggregateHousing(
      response(
        [
          {
            area: "13000",
            cat: HOUSING_ITEMS.totalDwellings,
            value: "8000000",
          },
          { area: "13101", cat: HOUSING_ITEMS.totalDwellings, value: "40000" },
          { area: "13101", cat: HOUSING_ITEMS.vacantDwellings, value: "4000" },
          {
            area: "13101",
            cat: HOUSING_ITEMS.rentPerTatamiYen,
            value: "5,120",
          },
          { area: "13101", cat: HOUSING_ITEMS.tatamiPerRental, value: "18.3" },
          {
            area: "13101",
            cat: HOUSING_ITEMS.floorAreaPerRental,
            value: "42.1",
          },
        ],
        [
          { code: "13000", name: "東京都" },
          { code: "13101", name: "千代田区" },
        ],
      ),
    );
    expect(rows).toEqual([
      {
        areaCode: "13101",
        areaName: "千代田区",
        totalDwellings: 40000,
        vacantDwellings: 4000,
        rentPerTatamiYen: 5120,
        tatamiPerRental: 18.3,
        floorAreaPerRental: 42.1,
      },
    ]);
  });

  it("一部が欠測でも行は残し、全部欠測なら落とす", () => {
    const rows = aggregateHousing(
      response(
        [
          /* 町村は家賃が無いことがある。住宅数だけの行として残す */
          { area: "01303", cat: HOUSING_ITEMS.totalDwellings, value: "1200" },
          { area: "01303", cat: HOUSING_ITEMS.vacantDwellings, value: "300" },
          { area: "01303", cat: HOUSING_ITEMS.rentPerTatamiYen, value: "-" },
          /* 全部欠測 */
          { area: "01304", cat: HOUSING_ITEMS.totalDwellings, value: "***" },
          { area: "01304", cat: HOUSING_ITEMS.rentPerTatamiYen, value: "-" },
        ],
        [
          { code: "01303", name: "当別町" },
          { code: "01304", name: "新篠津村" },
        ],
      ),
    );
    expect(rows.map((r) => r.areaCode)).toEqual(["01303"]);
    expect(rows[0].rentPerTatamiYen).toBeNull();
    expect(rows[0].vacantDwellings).toBe(300);
  });

  it("知らない項目コードは無視する", () => {
    const rows = aggregateHousing(
      response(
        [
          { area: "13101", cat: "H9999", value: "1" },
          { area: "13101", cat: HOUSING_ITEMS.totalDwellings, value: "10" },
        ],
        [{ code: "13101", name: "千代田区" }],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalDwellings).toBe(10);
  });
});
