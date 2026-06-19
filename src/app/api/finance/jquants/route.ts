import { NextResponse } from "next/server";

type JsonRecord = Record<string, unknown>;

interface NormalizedFinancials {
  code: string;
  companyName: string | null;
  disclosureDate: string | null;
  disclosureTime: string | null;
  fiscalPeriod: string | null;
  fiscalYearEnd: string | null;
  documentType: string | null;
  accountingStandard: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  totalAssets: number | null;
  equity: number | null;
  equityRatio: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  forecastRevenue: number | null;
  forecastOperatingIncome: number | null;
  forecastOrdinaryIncome: number | null;
  forecastNetIncome: number | null;
  forecastEps: number | null;
}

const JQUANTS_BASE_URL = "https://api.jquants.com/v2";
const EXTERNAL_TIMEOUT_MS = 10000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueFrom(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function stringFrom(record: JsonRecord, keys: string[]): string | null {
  const value = valueFrom(record, keys);
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function numberFrom(record: JsonRecord, keys: string[]): number | null {
  const value = valueFrom(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "nan") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\.T$/, "");
  return /^\d{4,5}$/.test(code) ? code : null;
}

function normalizeJQuantsRow(row: JsonRecord, requestedCode: string): NormalizedFinancials {
  return {
    code: stringFrom(row, ["Code", "LocalCode"]) || requestedCode,
    companyName: stringFrom(row, ["CompanyName", "FilerName"]),
    disclosureDate: stringFrom(row, ["DiscDate", "DisclosedDate"]),
    disclosureTime: stringFrom(row, ["DiscTime", "DisclosedTime"]),
    fiscalPeriod: stringFrom(row, ["CurPerType", "TypeOfCurrentPeriod"]),
    fiscalYearEnd: stringFrom(row, ["CurFYEndDate", "CurrentFiscalYearEndDate", "CurPerEndDate", "CurrentPeriodEndDate"]),
    documentType: stringFrom(row, ["DocType", "TypeOfDocument"]),
    accountingStandard: stringFrom(row, ["AccountingStandard", "AccountingStandards"]),
    revenue: numberFrom(row, ["Sales", "NetSales", "Revenue"]),
    operatingIncome: numberFrom(row, ["OP", "OperatingProfit", "OperatingIncome"]),
    ordinaryIncome: numberFrom(row, ["OdP", "OrdinaryProfit", "OrdinaryIncome"]),
    netIncome: numberFrom(row, ["NP", "Profit", "NetIncome"]),
    eps: numberFrom(row, ["EPS", "EarningsPerShare"]),
    totalAssets: numberFrom(row, ["TA", "TotalAssets"]),
    equity: numberFrom(row, ["Eq", "Equity", "NetAssets"]),
    equityRatio: numberFrom(row, ["EqAR", "EquityToAssetRatio", "EquityRatio"]),
    operatingCashFlow: numberFrom(row, ["CFO", "CashFlowsFromOperatingActivities"]),
    investingCashFlow: numberFrom(row, ["CFI", "CashFlowsFromInvestingActivities"]),
    financingCashFlow: numberFrom(row, ["CFF", "CashFlowsFromFinancingActivities"]),
    forecastRevenue: numberFrom(row, ["FSales", "ForecastNetSales", "ForecastRevenue"]),
    forecastOperatingIncome: numberFrom(row, ["FOP", "ForecastOperatingProfit", "ForecastOperatingIncome"]),
    forecastOrdinaryIncome: numberFrom(row, ["FOdP", "ForecastOrdinaryProfit", "ForecastOrdinaryIncome"]),
    forecastNetIncome: numberFrom(row, ["FNP", "ForecastProfit", "ForecastNetIncome"]),
    forecastEps: numberFrom(row, ["FEPS", "ForecastEarningsPerShare"]),
  };
}

function newestFirst(a: JsonRecord, b: JsonRecord): number {
  const aKey = `${stringFrom(a, ["DiscDate", "DisclosedDate"]) || ""} ${stringFrom(a, ["DiscTime", "DisclosedTime"]) || ""}`;
  const bKey = `${stringFrom(b, ["DiscDate", "DisclosedDate"]) || ""} ${stringFrom(b, ["DiscTime", "DisclosedTime"]) || ""}`;
  return bKey.localeCompare(aKey);
}

async function fetchJQuantsFinancials(code: string, apiKey: string) {
  const url = new URL(`${JQUANTS_BASE_URL}/fins/summary`);
  url.searchParams.set("code", code);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      next: { revalidate: 900 },
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`J-Quants ${response.status}: ${detail.slice(0, 160)}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new Error("J-Quants returned an unexpected response.");
    }

    const rows = payload.data.filter(isRecord).sort(newestFirst);
    if (rows.length === 0) {
      throw new Error("J-Quants returned no financial statements for this code.");
    }

    return {
      latest: normalizeJQuantsRow(rows[0], code),
      previous: rows[1] ? normalizeJQuantsRow(rows[1], code) : null,
      records: rows.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooFallback(code: string): Promise<NormalizedFinancials | null> {
  const symbol = `${code.slice(0, 4)}.T`;
  const types = [
    "quarterlyTotalRevenue",
    "quarterlyOperatingIncome",
    "quarterlyNetIncome",
    "quarterlyDilutedEPS",
    "quarterlyTotalAssets",
    "quarterlyStockholdersEquity",
    "quarterlyOperatingCashFlow",
  ];
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 4 * 365 * 24 * 60 * 60;
  const url = new URL(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}`,
  );
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", types.join(","));
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; my-portfolio/1.0)",
      },
      next: { revalidate: 900 },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Yahoo Finance ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.timeseries) || !Array.isArray(payload.timeseries.result)) {
      return null;
    }

    const series = payload.timeseries.result.filter(isRecord);
    const latestByType = new Map<string, { date: string | null; value: number | null }>();
    for (const item of series) {
      const type = stringFrom(item, ["metaType", "type"]);
      if (!type) continue;
      const entries = Array.isArray(item[type]) ? item[type].filter(isRecord) : [];
      const latest = entries.sort((a, b) =>
        (stringFrom(b, ["asOfDate"]) || "").localeCompare(stringFrom(a, ["asOfDate"]) || ""),
      )[0];
      if (!latest) continue;
      const reportedValue = isRecord(latest.reportedValue) ? latest.reportedValue : {};
      latestByType.set(type, {
        date: stringFrom(latest, ["asOfDate"]),
        value: numberFrom(reportedValue, ["raw", "fmt"]),
      });
    }

    const read = (type: string) => latestByType.get(type)?.value ?? null;
    const disclosureDate = [...latestByType.values()]
      .map((entry) => entry.date)
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1) ?? null;

    return {
      code,
      companyName: null,
      disclosureDate,
      disclosureTime: null,
      fiscalPeriod: "Latest quarter",
      fiscalYearEnd: disclosureDate,
      documentType: "Yahoo Finance quarterly fundamentals",
      accountingStandard: null,
      revenue: read("quarterlyTotalRevenue"),
      operatingIncome: read("quarterlyOperatingIncome"),
      ordinaryIncome: null,
      netIncome: read("quarterlyNetIncome"),
      eps: read("quarterlyDilutedEPS"),
      totalAssets: read("quarterlyTotalAssets"),
      equity: read("quarterlyStockholdersEquity"),
      equityRatio: null,
      operatingCashFlow: read("quarterlyOperatingCashFlow"),
      investingCashFlow: null,
      financingCashFlow: null,
      forecastRevenue: null,
      forecastOperatingIncome: null,
      forecastOrdinaryIncome: null,
      forecastNetIncome: null,
      forecastEps: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = normalizeCode(searchParams.get("code") || "");
  if (!code) {
    return NextResponse.json(
      { success: false, error: "4桁または5桁の日本株コードを指定してください。" },
      { status: 400 },
    );
  }

  const apiKey = process.env.JQUANTS_API_KEY;
  let jquantsError: string | null = null;

  if (apiKey) {
    try {
      const data = await fetchJQuantsFinancials(code, apiKey);
      return NextResponse.json({
        success: true,
        data,
        meta: {
          source: "J-Quants API",
          sourceUrl: "https://jpx-jquants.com/",
          mode: "primary",
          asOf: new Date().toISOString(),
          note: "JPX公式J-Quantsの最新決算短信サマリーです。",
        },
      });
    } catch (error) {
      jquantsError = error instanceof Error ? error.message : "J-Quants request failed.";
      console.error("J-Quants financial fetch failed; using free fallback.", error);
    }
  }

  try {
    const latest = await fetchYahooFallback(code);
    if (latest) {
      return NextResponse.json({
        success: true,
        data: { latest, previous: null, records: 1 },
        meta: {
          source: "Yahoo Finance",
          sourceUrl: `https://finance.yahoo.co.jp/quote/${code.slice(0, 4)}.T`,
          mode: apiKey ? "fallback" : "free_fallback",
          asOf: new Date().toISOString(),
          note: apiKey
            ? "J-Quantsが一時利用できないため、無料の企業指標へ切り替えました。"
            : "JQUANTS_API_KEY未設定のため、無料の企業指標を表示しています。",
          jquantsError,
        },
      });
    }
  } catch (error) {
    console.error("Yahoo Finance financial fallback failed.", error);
  }

  return NextResponse.json(
    {
      success: false,
      error: "財務情報を取得できませんでした。",
      setupRequired: !apiKey,
      jquantsError,
    },
    { status: 503 },
  );
}
