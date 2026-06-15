import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { maskPII } from "@/utils/anonymizer";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text, type } = await req.json();

    if (!text || !type) {
      return NextResponse.json(
        { error: "Text and type parameters are required." },
        { status: 400 },
      );
    }

    const maskedText = maskPII(text);

    let schema: any;
    let systemInstruction = "";

    if (type === "stock") {
      schema = z.object({
        data: z.array(
          z.object({
            date: z.string().describe("Date of the stock quote, e.g. '06/15' or '06-15'"),
            open: z.number().describe("Opening price of the day"),
            high: z.number().describe("Highest price of the day"),
            low: z.number().describe("Lowest price of the day"),
            close: z.number().describe("Closing price of the day"),
            change: z.number().describe("Net change from previous day's close. Parse +/- prefixes, set 0 if not available."),
            volume: z.number().describe("Trading volume (number of shares traded)"),
          })
        ),
      });
      systemInstruction = `
You are an expert financial data parser. Your task is to parse unstructured copy-pasted daily stock quote timeseries data.
Clean numbers by removing commas, currency symbols, and spaces, and convert them to floats or integers.
For the change column, parse symbols like '+' or '-' or '—' into a clean positive or negative number.
Output the parsed data array in reverse chronological order (oldest to newest) or as given, but make sure all values are properly formatted numbers.
      `;
    } else if (type === "bs") {
      schema = z.object({
        assets: z.object({
          current: z.number().describe("Current Assets (流動資産)"),
          non_current: z.number().describe("Non-current Assets / Fixed Assets (固定資産)"),
          total: z.number().describe("Total Assets (資産合計)"),
        }),
        liabilities: z.object({
          current: z.number().describe("Current Liabilities (流動負債)"),
          non_current: z.number().describe("Non-current Liabilities (固定負債)"),
          total: z.number().describe("Total Liabilities (負債合計)"),
        }),
        equity: z.object({
          share_capital: z.number().describe("Share Capital / Common Stock (資本金)"),
          retained_earnings: z.number().describe("Retained Earnings (利益剰余金)"),
          other: z.number().describe("Other Equity / Minorities / Treasury Stock (その他純資産・自己株式など)"),
          total: z.number().describe("Total Equity / Net Assets (純資産合計)"),
        }),
      });
      systemInstruction = `
You are an expert corporate accountant. Your task is to parse a copy-pasted Balance Sheet (B/S) table or text summary.
Identify and group the figures into standard categories: Assets (Current, Non-Current, and Total), Liabilities (Current, Non-Current, and Total), and Equity (Capital, Retained Earnings, Other, and Total).
Units can be in Millions of Yen (百万円), Billions of Yen (十億円), or single Yen. Standardize all numbers to the same unit (prefer Millions of Yen or raw currency - extract the value and normalize).
Ensure the accounting equation balances: Assets = Liabilities + Equity. If there is a small rounding error, adjust 'other' equity slightly to make them perfectly balance.
      `;
    } else if (type === "pl") {
      schema = z.object({
        net_sales: z.number().describe("Net Sales / Revenue (売上高)"),
        cost_of_sales: z.number().describe("Cost of Sales / Cost of Goods Sold (売上原価)"),
        gross_profit: z.number().describe("Gross Profit (売上総利益). If missing, calculate as Net Sales - Cost of Sales."),
        sga_expenses: z.number().describe("SG&A expenses (販売費及び一般管理費)"),
        operating_income: z.number().describe("Operating Income (営業利益). If missing, calculate as Gross Profit - SG&A."),
        ordinary_income: z.number().describe("Ordinary Income (経常利益). If missing, set equal to Operating Income or adjust for non-operating items."),
        net_income: z.number().describe("Net Income / Net Profit (当期純利益)"),
      });
      systemInstruction = `
You are an expert corporate accountant. Your task is to parse a copy-pasted Profit & Loss (P/L) table or text summary.
Identify and extract key metrics: Net Sales, Cost of Sales, Gross Profit, SG&A expenses, Operating Income, Ordinary Income, and Net Income.
Normalize all figures to the same unit. If any intermediate math is slightly inconsistent in the text, calculate and adjust them so they flow logically:
- Gross Profit = Net Sales - Cost of Sales
- Operating Income = Gross Profit - SG&A Expenses
      `;
    } else {
      return NextResponse.json({ error: "Invalid type parameter." }, { status: 400 });
    }

    const result = await generateObject({
      model: google("gemini-1.5-flash"),
      schema: schema,
      system: systemInstruction,
      prompt: `Please parse the following financial text:\n\n${maskedText}`,
    });

    return NextResponse.json({ success: true, data: result.object });
  } catch (error: any) {
    console.error("Finance Parse API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse financial data." },
      { status: 500 },
    );
  }
}
