type JsonRecord = Record<string, unknown>;

export interface NormalizedBS {
  currentAssets: number;
  nonCurrentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;
  totalLiabilities: number;
  shareCapital: number;
  retainedEarnings: number;
  totalEquity: number;
}

export interface NormalizedPL {
  net_sales: number;
  cost_of_sales: number;
  gross_profit: number;
  sga_expenses: number;
  operating_income: number;
  ordinary_income: number;
  net_income: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function toMillions(value: number | null): number {
  return value === null ? 0 : Math.round(value / 1_000_000);
}

function dateFrom(record: JsonRecord): string | null {
  const value = record.date;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value.slice(0, 10) : null;
}

export function normalizeYahooFinancialDetails(
  code: string,
  payload: unknown,
) {
  if (!Array.isArray(payload)) return null;
  const latest = payload
    .filter(isRecord)
    .sort((a, b) => (dateFrom(b) || "").localeCompare(dateFrom(a) || ""))[0];
  if (!latest) return null;

  const read = (...keys: string[]) => numberFrom(latest, keys);
  let totalAssetsRaw = read("totalAssets", "quarterlyTotalAssets");
  const currentAssetsRaw = read("currentAssets", "quarterlyCurrentAssets");
  const nonCurrentAssetsRaw =
    read("totalNonCurrentAssets", "quarterlyTotalNonCurrentAssets") ??
    (totalAssetsRaw !== null && currentAssetsRaw !== null
      ? totalAssetsRaw - currentAssetsRaw
      : null);
  if (
    totalAssetsRaw === null &&
    currentAssetsRaw !== null &&
    nonCurrentAssetsRaw !== null
  ) {
    totalAssetsRaw = currentAssetsRaw + nonCurrentAssetsRaw;
  }

  let totalLiabilitiesRaw = read(
    "totalLiabilitiesNetMinorityInterest",
    "quarterlyTotalLiabilitiesNetMinorityInterest",
  );
  const currentLiabilitiesRaw = read(
    "currentLiabilities",
    "quarterlyCurrentLiabilities",
  );
  const nonCurrentLiabilitiesRaw =
    read(
      "totalNonCurrentLiabilitiesNetMinorityInterest",
      "quarterlyTotalNonCurrentLiabilitiesNetMinorityInterest",
    ) ??
    (totalLiabilitiesRaw !== null && currentLiabilitiesRaw !== null
      ? totalLiabilitiesRaw - currentLiabilitiesRaw
      : null);
  const equityRaw = read(
    "stockholdersEquity",
    "commonStockEquity",
    "quarterlyStockholdersEquity",
  );
  if (
    totalLiabilitiesRaw === null &&
    currentLiabilitiesRaw !== null &&
    nonCurrentLiabilitiesRaw !== null
  ) {
    totalLiabilitiesRaw = currentLiabilitiesRaw + nonCurrentLiabilitiesRaw;
  } else if (
    totalLiabilitiesRaw === null &&
    totalAssetsRaw !== null &&
    equityRaw !== null
  ) {
    totalLiabilitiesRaw = totalAssetsRaw - equityRaw;
  }

  const revenueRaw = read(
    "totalRevenue",
    "operatingRevenue",
    "quarterlyTotalRevenue",
  );
  const costRaw = read("costOfRevenue", "quarterlyCostOfRevenue");
  const grossProfitRaw =
    read("grossProfit", "quarterlyGrossProfit") ??
    (revenueRaw !== null && costRaw !== null ? revenueRaw - costRaw : null);
  if (totalAssetsRaw === null && revenueRaw === null) return null;

  const operatingIncomeRaw = read(
    "operatingIncome",
    "quarterlyOperatingIncome",
  );
  const bs: NormalizedBS = {
    currentAssets: toMillions(currentAssetsRaw),
    nonCurrentAssets: toMillions(nonCurrentAssetsRaw),
    totalAssets: toMillions(totalAssetsRaw),
    currentLiabilities: toMillions(currentLiabilitiesRaw),
    nonCurrentLiabilities: toMillions(nonCurrentLiabilitiesRaw),
    totalLiabilities: toMillions(totalLiabilitiesRaw),
    shareCapital: toMillions(
      read("capitalStock", "commonStock", "quarterlyCapitalStock"),
    ),
    retainedEarnings: toMillions(
      read("retainedEarnings", "quarterlyRetainedEarnings"),
    ),
    totalEquity: toMillions(
      equityRaw ??
        (totalAssetsRaw !== null && totalLiabilitiesRaw !== null
          ? totalAssetsRaw - totalLiabilitiesRaw
          : null),
    ),
  };
  const pl: NormalizedPL = {
    net_sales: toMillions(revenueRaw),
    cost_of_sales: toMillions(costRaw),
    gross_profit: toMillions(grossProfitRaw),
    sga_expenses: toMillions(
      read(
        "sellingGeneralAndAdministration",
        "quarterlySellingGeneralAndAdministration",
      ),
    ),
    operating_income: toMillions(operatingIncomeRaw),
    ordinary_income: toMillions(operatingIncomeRaw),
    net_income: toMillions(read("netIncome", "quarterlyNetIncome")),
  };

  return {
    code,
    disclosureDate: dateFrom(latest),
    disclosureTime: null,
    documentType: "Yahoo Finance quarterly fundamentals",
    bs,
    pl,
    rawFS: {},
  };
}
