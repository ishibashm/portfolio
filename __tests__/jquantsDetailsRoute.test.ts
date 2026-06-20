import { describe, expect, it } from "vitest";

import { normalizeYahooFinancialDetails } from "@/app/api/finance/jquants/details/normalize";

describe("Yahoo Finance financial details normalization", () => {
  it("normalizes the latest quarterly B/S and P/L values to million yen", () => {
    const result = normalizeYahooFinancialDetails("6758", [
      {
        date: new Date("2025-12-31"),
        totalAssets: 39_000_000_000,
        totalRevenue: 29_000_000_000,
      },
      {
        date: new Date("2026-03-31"),
        currentAssets: 12_000_000_000,
        totalAssets: 40_000_000_000,
        currentLiabilities: 8_000_000_000,
        totalLiabilitiesNetMinorityInterest: 22_000_000_000,
        stockholdersEquity: 18_000_000_000,
        capitalStock: 5_000_000_000,
        retainedEarnings: 11_000_000_000,
        totalRevenue: 30_000_000_000,
        costOfRevenue: 18_000_000_000,
        operatingIncome: 4_000_000_000,
        netIncome: 2_500_000_000,
      },
    ]);

    expect(result?.disclosureDate).toBe("2026-03-31");
    expect(result?.bs).toEqual(
      expect.objectContaining({
        currentAssets: 12_000,
        nonCurrentAssets: 28_000,
        totalAssets: 40_000,
        currentLiabilities: 8_000,
        nonCurrentLiabilities: 14_000,
        totalLiabilities: 22_000,
        totalEquity: 18_000,
      }),
    );
    expect(result?.pl).toEqual(
      expect.objectContaining({
        net_sales: 30_000,
        cost_of_sales: 18_000,
        gross_profit: 12_000,
        operating_income: 4_000,
        net_income: 2_500,
      }),
    );
  });
});
