import { NextResponse } from "next/server";
import yahooFinanceModule from "yahoo-finance2";

// yahoo-finance2のデフォルトエクスポートはクラス/インスタンスとして機能します
const yahooFinance =
  typeof yahooFinanceModule === "function"
    ? new (yahooFinanceModule as any)()
    : yahooFinanceModule;
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const type = searchParams.get("type") || "quote"; // quote, chart, summary

  if (!ticker) {
    return NextResponse.json(
      { error: 'Query parameter "ticker" is required' },
      { status: 400 },
    );
  }

  try {
    if (type === "quote") {
      const quote = await yahooFinance.quote(ticker);
      return NextResponse.json({ success: true, data: quote });
    } else if (type === "chart") {
      const period1 = searchParams.get("period1") || "2020-01-01";
      const period2 =
        searchParams.get("period2") || new Date().toISOString().split("T")[0];
      const interval = searchParams.get("interval") || "1d"; // 1d, 1wk, 1mo

      // @ts-ignore
      const queryOptions = { period1, period2, interval };
      const chartData = await yahooFinance.chart(ticker, queryOptions);
      return NextResponse.json({ success: true, data: chartData });
    } else if (type === "summary") {
      // Get detailed company profile and financial data
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "recommendationTrend",
          "calendarEvents",
        ],
      });
      return NextResponse.json({ success: true, data: summary });
    }

    return NextResponse.json(
      { error: "Invalid type parameter" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Yahoo Finance API Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch data from Yahoo Finance API",
      },
      { status: 500 },
    );
  }
}
