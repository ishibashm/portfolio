import { describe, expect, it } from "vitest";
import { estimateBuildingSplit, toRow } from "../scripts/propertyTxParse";

/**
 * 土地と建物の内訳の推定（積算評価）の固定。
 *
 * 値は手で計算して固定する。式の写し合わせ（実装と同じ式をテストにも
 * 書く）では、式が間違っていても両方同じに間違うので意味がない。
 */

const base = {
  property_type: "宅地(土地と建物)",
  trade_price: 30_000_000,
  trade_year: 2025,
  total_floor_area_sqm: 100,
  building_year: 2015,
  structure: "木造",
};

describe("estimateBuildingSplit", () => {
  it("木造・築10年・延床100㎡・総額3,000万", () => {
    /*
      手計算:
        残存 = (22 - 10) / 22 = 0.54545…
        建物 = 100㎡ × 15万 × 0.54545… = 8,181,818（四捨五入）
        土地 = 30,000,000 − 8,181,818 = 21,818,182
        比率 = 0.2727…
    */
    const s = estimateBuildingSplit(base)!;
    expect(s.estBuildingPrice).toBe(8_181_818);
    expect(s.estLandPrice).toBe(21_818_182);
    expect(s.buildingRatio).toBeCloseTo(0.2727, 3);
  });

  it("ＲＣ・新築なら残存 1.0", () => {
    /*
      手計算: 100㎡ × 20万 × 1.0 = 20,000,000。比率 = 2/3。
    */
    const s = estimateBuildingSplit({
      ...base,
      structure: "ＲＣ",
      building_year: 2025,
    })!;
    expect(s.estBuildingPrice).toBe(20_000_000);
    expect(s.buildingRatio).toBeCloseTo(0.6667, 3);
  });

  it("法定耐用年数を過ぎても 2 割は残す", () => {
    /*
      木造・築40年（耐用22年を超過）。
      手計算: 100㎡ × 15万 × 0.2 = 3,000,000。
      0 にすると「築古だが設備のしっかりした家」が全部 land 100% になり、
      建物で探すというこの機能の目的と矛盾する。
    */
    const s = estimateBuildingSplit({ ...base, building_year: 1985 })!;
    expect(s.estBuildingPrice).toBe(3_000_000);
  });

  it("積算が総額を超えたら頭打ちにして土地を負にしない", () => {
    /*
      新築ＲＣ 200㎡ = 4,000万 の積算に対し総額 1,000万。
      建物 = 1,000万（頭打ち）、土地 = 0、比率 = 1.0。
    */
    const s = estimateBuildingSplit({
      ...base,
      structure: "ＲＣ",
      building_year: 2025,
      total_floor_area_sqm: 200,
      trade_price: 10_000_000,
    })!;
    expect(s.estBuildingPrice).toBe(10_000_000);
    expect(s.estLandPrice).toBe(0);
    expect(s.buildingRatio).toBe(1.0);
  });

  it("延床ちょうど 2000㎡（「2000㎡以上」の下限読み）は計算する", () => {
    expect(
      estimateBuildingSplit({ ...base, total_floor_area_sqm: 2000 }),
    ).not.toBeNull();
  });

  it("複合表記「ＲＣ、木造」は先に並べた側（ＲＣ）で読む", () => {
    const s = estimateBuildingSplit({ ...base, structure: "ＲＣ、木造" })!;
    // ＲＣ: 残存 (47-10)/47、100㎡ × 20万 → 15,744,681
    expect(s.estBuildingPrice).toBe(15_744_681);
  });

  for (const [name, patch] of [
    ["土地だけの取引", { property_type: "宅地(土地)" }],
    [
      "マンション（区分所有は按分で分けられない）",
      { property_type: "中古マンション等" },
    ],
    ["延床が無い", { total_floor_area_sqm: null }],
    ["築年が無い", { building_year: null }],
    ["構造が無い", { structure: null }],
    ["総額が無い", { trade_price: null }],
    [
      // 国交省は面積を「2000㎡以上」で頭打ちにするので、2000 超の数値は
      // 正規の値ではない。全国監査で見つかった延床 9999㎡（岩沼市・
      // 総額 3 億 → 建物 3 億・土地 0 になっていた）の再発防止。
      "延床が 2000㎡ を超える（異常値）",
      { total_floor_area_sqm: 9999 },
    ],
  ] as const) {
    it(`${name} → null（NULL のまま残す）`, () => {
      expect(estimateBuildingSplit({ ...base, ...patch })).toBeNull();
    });
  }
});

describe("toRow が推定を列に詰める", () => {
  it("宅地(土地と建物) の行に est_* が入る", () => {
    // probe で確認した実物の項目名（TotalFloorArea など）で組む。
    const row = toRow(
      {
        MunicipalityCode: "26100",
        Prefecture: "京都府",
        Municipality: "京都市",
        DistrictName: "北区",
        Type: "宅地(土地と建物)",
        TradePrice: "30000000",
        Area: "120",
        TotalFloorArea: "100",
        BuildingYear: "2015年",
        Structure: "木造",
      },
      2025,
      1,
    )!;
    expect(row.total_floor_area_sqm).toBe(100);
    expect(row.est_building_price).toBe(8_181_818);
    expect(row.est_land_price).toBe(21_818_182);
    expect(row.building_ratio).toBeCloseTo(0.2727, 3);
  });

  it("土地だけの取引は null のまま", () => {
    const row = toRow(
      {
        MunicipalityCode: "26100",
        Prefecture: "京都府",
        Municipality: "京都市",
        Type: "宅地(土地)",
        TradePrice: "30000000",
        Area: "120",
      },
      2025,
      1,
    )!;
    expect(row.est_building_price).toBeNull();
    expect(row.building_ratio).toBeNull();
  });
});
