import { describe, expect, it } from "vitest";
import {
  housingFiguresFor,
  rentDiffPct,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";
import { toHousingSnapshot } from "../scripts/estatHousing";

/*
  市区町村ページの相場を、掲載由来（凍結）から e-Stat の写しに置き換える
  ための読み口。割り算の定数と丸めは方位別の読み口と同じ
  （housingStatsDirections: 1 畳 = 1.62 ㎡、月額は 100 円丸め）。
*/
const SNAP: HousingSnapshotData = {
  year: 2023,
  generatedAt: "2026-09-19T00:00:00.000Z",
  areas: {
    "13113": {
      name: "渋谷区",
      totalDwellings: 150000,
      vacantDwellings: 15000,
      rentPerTatamiYen: 6480,
      tatamiPerRental: 12.5,
      floorAreaPerRental: 38.4,
    },
    "01101": {
      name: "札幌市中央区",
      totalDwellings: 0,
      vacantDwellings: 0,
      rentPerTatamiYen: null,
      tatamiPerRental: 18,
      floorAreaPerRental: null,
    },
  },
};

describe("housingFiguresFor", () => {
  it("1 畳当たり家賃を ㎡単価と月額の目安に直す", () => {
    const f = housingFiguresFor(SNAP, "13113")!;
    expect(f.rentPerSqm).toBe(4000); // 6480 / 1.62
    expect(f.monthlyRentEstimate).toBe(81000); // 6480 × 12.5 = 81000
    expect(f.vacancyRate).toBeCloseTo(0.1);
    expect(f.floorAreaPerRental).toBe(38.4);
    expect(f.year).toBe(2023);
  });

  it("無い値は null。総住宅数 0 の空き家率も null（0 で割らない）", () => {
    const f = housingFiguresFor(SNAP, "01101")!;
    expect(f.rentPerSqm).toBeNull();
    expect(f.monthlyRentEstimate).toBeNull();
    expect(f.vacancyRate).toBeNull();
    expect(f.floorAreaPerRental).toBeNull();
  });

  it("写しに無い地域コードは null", () => {
    expect(housingFiguresFor(SNAP, "99999")).toBeNull();
  });
});

describe("rentDiffPct", () => {
  it("出発地に対する差（%）。負なら安い", () => {
    const origin = housingFiguresFor(SNAP, "13113")!;
    const cheaper = { ...origin, rentPerSqm: 3000 };
    expect(rentDiffPct(origin, cheaper)).toBe(-25);
    expect(rentDiffPct(origin, origin)).toBe(0);
  });

  it("どちらかに家賃が無ければ null", () => {
    const origin = housingFiguresFor(SNAP, "13113")!;
    expect(rentDiffPct(origin, housingFiguresFor(SNAP, "01101"))).toBeNull();
    expect(rentDiffPct(housingFiguresFor(SNAP, "01101"), origin)).toBeNull();
    expect(rentDiffPct(origin, null)).toBeNull();
  });
});

describe("写しの形が scripts 側と同じ", () => {
  it("toHousingSnapshot の出力をそのまま読める", () => {
    const snap = toHousingSnapshot(
      [
        {
          areaCode: "13113",
          areaName: "渋谷区",
          totalDwellings: 150000,
          vacantDwellings: 15000,
          rentPerTatamiYen: 6480,
          tatamiPerRental: 12.5,
          floorAreaPerRental: 38.4,
        },
      ],
      2023,
      "x",
    );
    // scripts 側の型と lib 側の型がずれたら、ここが型で落ちる
    const data: HousingSnapshotData = snap;
    expect(housingFiguresFor(data, "13113")?.rentPerSqm).toBe(4000);
  });
});
