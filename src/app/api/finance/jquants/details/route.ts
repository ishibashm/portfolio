import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

import {
  normalizeYahooFinancialDetails,
  type NormalizedBS,
  type NormalizedPL,
} from "./normalize";

type JsonRecord = Record<string, unknown>;

const JQUANTS_BASE_URL = "https://api.jquants.com/v2";
const yahooFinance = new YahooFinance();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    if (
      record[key] !== undefined &&
      record[key] !== null &&
      record[key] !== ""
    ) {
      return String(record[key]);
    }
  }
  return null;
}

function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\.T$/, "");
  return /^\d{4,5}$/.test(code) ? code : null;
}

function newestFirst(a: JsonRecord, b: JsonRecord): number {
  const aKey = `${stringFrom(a, ["DiscDate", "DisclosedDate"]) || ""} ${stringFrom(a, ["DiscTime", "DisclosedTime"]) || ""}`;
  const bKey = `${stringFrom(b, ["DiscDate", "DisclosedDate"]) || ""} ${stringFrom(b, ["DiscTime", "DisclosedTime"]) || ""}`;
  return bKey.localeCompare(aKey);
}

function findFinancialValue(fs: JsonRecord, regexPatterns: RegExp[]): number {
  for (const pattern of regexPatterns) {
    const matchedKey = Object.keys(fs).find((key) => pattern.test(key));
    if (matchedKey !== undefined) {
      const val = Number(fs[matchedKey]);
      if (Number.isFinite(val)) {
        // Convert Yen to Million Yen (rounding to nearest integer)
        return Math.round(val / 1000000);
      }
    }
  }
  return 0;
}

async function fetchYahooFinancialDetails(code: string) {
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - 4);
  const payload = await yahooFinance.fundamentalsTimeSeries(
    `${code.slice(0, 4)}.T`,
    {
      period1,
      period2,
      type: "quarterly",
      module: "all",
    },
  );
  return normalizeYahooFinancialDetails(code, payload);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = normalizeCode(searchParams.get("code") || "");

  if (!code) {
    return NextResponse.json(
      {
        success: false,
        error: "4桁または5桁の日本株コードを指定してください。",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.JQUANTS_API_KEY;
  let jquantsError: string | null = null;

  if (apiKey) {
    try {
      const url = new URL(`${JQUANTS_BASE_URL}/fins/details`);
      // Pass 5-digit code as required by J-Quants details API (e.g. 86970)
      url.searchParams.set("code", code.length === 4 ? `${code}0` : code);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        next: { revalidate: 900 },
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `J-Quants API Error (${response.status}): ${detail.slice(0, 150)}`,
        );
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error("J-Quants APIから予期しないレスポンスが返されました。");
      }

      const rows = payload.data.filter(isRecord).sort(newestFirst);
      if (rows.length === 0) {
        throw new Error(
          "指定された銘柄の詳細財務諸表データが見つかりませんでした。",
        );
      }

      const latestRow = rows[0];
      const fs = isRecord(latestRow.FS) ? latestRow.FS : {};

      // Normalize Balance Sheet (B/S)
      const currentAssets = findFinancialValue(fs, [
        /^Current assets\b.*Total/i,
        /^Current assets\b/i,
      ]);
      const nonCurrentAssets = findFinancialValue(fs, [
        /^Non-current assets\b.*Total/i,
        /^Non-current assets\b/i,
      ]);
      let totalAssets = findFinancialValue(fs, [
        /^Assets\b.*Total/i,
        /^Assets\b/i,
      ]);
      if (totalAssets === 0) totalAssets = currentAssets + nonCurrentAssets;

      const currentLiabilities = findFinancialValue(fs, [
        /^Current liabilities\b.*Total/i,
        /^Current liabilities\b/i,
      ]);
      const nonCurrentLiabilities = findFinancialValue(fs, [
        /^Non-current liabilities\b.*Total/i,
        /^Non-current liabilities\b/i,
      ]);
      let totalLiabilities = findFinancialValue(fs, [
        /^Liabilities\b.*Total/i,
        /^Liabilities\b/i,
      ]);
      if (totalLiabilities === 0)
        totalLiabilities = currentLiabilities + nonCurrentLiabilities;

      const shareCapital = findFinancialValue(fs, [
        /^Share capital\b/i,
        /^Common stock\b/i,
      ]);
      const retainedEarnings = findFinancialValue(fs, [
        /^Retained earnings\b/i,
      ]);
      let totalEquity = findFinancialValue(fs, [
        /^Net assets\b.*Total/i,
        /^Equity\b/i,
        /^Shareholders' equity\b.*Total/i,
      ]);
      if (totalEquity === 0) totalEquity = totalAssets - totalLiabilities;

      const normalizedBS: NormalizedBS = {
        currentAssets,
        nonCurrentAssets,
        totalAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        totalLiabilities,
        shareCapital,
        retainedEarnings,
        totalEquity,
      };

      // Normalize Income Statement (P/L)
      const net_sales = findFinancialValue(fs, [
        /^(Net sales|Operating revenue|Revenue)\b.*Total/i,
        /^(Net sales|Operating revenue|Revenue)\b/i,
      ]);
      const cost_of_sales = findFinancialValue(fs, [/^Cost of sales\b/i]);
      let gross_profit = findFinancialValue(fs, [/^Gross profit\b/i]);
      if (gross_profit === 0 && net_sales > 0) {
        gross_profit = Math.max(0, net_sales - cost_of_sales);
      }
      const sga_expenses = findFinancialValue(fs, [
        /^Selling, general and administrative expenses\b/i,
      ]);
      const operating_income = findFinancialValue(fs, [
        /^(Operating income|Operating profit)\b/i,
        /^Operating profit \(loss\)\b/i,
      ]);
      const ordinary_income = findFinancialValue(fs, [
        /^(Ordinary income|Ordinary profit)\b/i,
      ]);
      const net_income = findFinancialValue(fs, [
        /^Profit \(loss\) attributable to owners of parent\b/i,
        /^Net income\b/i,
        /^Profit \(loss\)\b/i,
      ]);

      const normalizedPL: NormalizedPL = {
        net_sales,
        cost_of_sales,
        gross_profit,
        sga_expenses,
        operating_income,
        ordinary_income: ordinary_income || operating_income, // fallback to operating if ordinary is null
        net_income,
      };

      return NextResponse.json({
        success: true,
        data: {
          code,
          disclosureDate: stringFrom(latestRow, ["DiscDate", "DisclosedDate"]),
          disclosureTime: stringFrom(latestRow, ["DiscTime", "DisclosedTime"]),
          documentType: stringFrom(latestRow, ["DocType", "TypeOfDocument"]),
          bs: normalizedBS,
          pl: normalizedPL,
          rawFS: fs,
        },
        meta: {
          source: "J-Quants API /fins/details",
          mode: "primary",
          asOf: new Date().toISOString(),
        },
      });
    } catch (error) {
      jquantsError =
        error instanceof Error
          ? error.message
          : "J-Quants APIとの通信に失敗しました。";
      console.error(
        "J-Quants details API call failed; using free fallback:",
        error,
      );
    }
  }

  try {
    const fallback = await fetchYahooFinancialDetails(code);
    if (fallback) {
      return NextResponse.json({
        success: true,
        data: fallback,
        meta: {
          source: "Yahoo Finance",
          sourceUrl: `https://finance.yahoo.co.jp/quote/${code.slice(0, 4)}.T`,
          mode: apiKey ? "fallback" : "free_fallback",
          asOf: new Date().toISOString(),
          note: apiKey
            ? "J-Quantsの詳細財務データを利用できないため、Yahoo Financeの四半期データへ切り替えました。"
            : "JQUANTS_API_KEY未設定のため、Yahoo Financeの四半期データを表示しています。",
          jquantsError,
        },
      });
    }
  } catch (error) {
    console.error("Yahoo Finance details fallback failed:", error);
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "財務諸表を取得できませんでした。決算短信のテキストを貼り付けて解析することもできます。",
      setupRequired: !apiKey,
      jquantsError,
    },
    { status: 503 },
  );
}
