import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 必要なXBRL要素の定義（ir_analyses/utils/service/financial_service.py より）
const SUMMARY_ITEMS = {
  NetSales: [
    "jppfs_cor:NetSales",
    "jppfs_cor:OperatingRevenue1",
    "jppfs_cor:OperatingRevenueSEC",
    "jpigp_cor:RevenueIFRS",
  ],
  OperationIncome: [
    "jppfs_cor:OperatingIncome",
    "jpigp_cor:OperatingProfitLossIFRS",
  ],
  OrdinaryIncome: [
    "jppfs_cor:OrdinaryIncome",
    "jpigp_cor:ProfitLossBeforeTaxIFRS",
  ],
  Profit: [
    "jppfs_cor:ProfitLossAttributableToOwnersOfParent",
    "jppfs_cor:ProfitLoss",
    "jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS",
  ],
};

function getValueFromCandidates(
  dataMap: Record<string, number>,
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    if (dataMap[candidate] !== undefined) {
      return dataMap[candidate];
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const nameQuery = searchParams.get("name");
    const { ticker } = await params;

    // 企業を検索 (Tickerは日本の場合は '7203.T' のような形式だが、DBには会社名または証券コードで探す必要がある)
    let company;
    if (nameQuery) {
      company = await prisma.company.findFirst({
        where: { company_name: { contains: nameQuery } },
      });
    } else {
      // tickerから探す場合 (e.g. 7203.T -> 72030)
      const code = ticker.replace(".T", "") + "0";
      company = await prisma.company.findFirst({
        where: { security_code: code },
      });
    }

    if (!company) {
      return NextResponse.json(
        { error: "Company not found in DB" },
        { status: 404 },
      );
    }

    // 最新の有価証券報告書を取得
    const report = await prisma.financialReport.findFirst({
      where: { company_id: company.company_id },
      orderBy: [{ fiscal_year: "desc" }, { filing_date: "desc" }],
    });

    if (!report) {
      return NextResponse.json(
        { error: "Financial report not found" },
        { status: 404 },
      );
    }

    // すべての検索対象element_idをフラット化
    const allElementIds = Object.values(SUMMARY_ITEMS).flat();

    // FinancialItemを検索してitem_idを取得
    const items = await prisma.financialItem.findMany({
      where: { element_id: { in: allElementIds } },
    });

    const itemIdMap: Record<number, string> = {};
    items.forEach((item) => {
      itemIdMap[item.item_id] = item.element_id;
    });

    const itemIds = items.map((i) => i.item_id);

    // FinancialDataを取得
    const financialData = await prisma.financialData.findMany({
      where: {
        report_id: report.report_id,
        item_id: { in: itemIds },
      },
    });

    const dataMap: Record<string, number> = {};
    financialData.forEach((d) => {
      if (d.value !== null) {
        const elementId = itemIdMap[d.item_id];
        dataMap[elementId] = Number(d.value);
      }
    });

    let net_sales = getValueFromCandidates(dataMap, SUMMARY_ITEMS.NetSales);
    let operating_income = getValueFromCandidates(
      dataMap,
      SUMMARY_ITEMS.OperationIncome,
    );
    let ordinary_income = getValueFromCandidates(
      dataMap,
      SUMMARY_ITEMS.OrdinaryIncome,
    );
    let net_income = getValueFromCandidates(dataMap, SUMMARY_ITEMS.Profit);

    let operation_profit_rate = null;
    let ordinary_profit_rate = null;
    let net_profit_rate = null;

    if (operating_income && net_sales && net_sales !== 0) {
      operation_profit_rate = (operating_income / net_sales) * 100;
    }
    if (ordinary_income && net_sales && net_sales !== 0) {
      ordinary_profit_rate = (ordinary_income / net_sales) * 100;
    }
    if (net_income && net_sales && net_sales !== 0) {
      net_profit_rate = (net_income / net_sales) * 100;
    }

    // 100万円単位に変換（Pythonの実装に合わせる）
    if (net_sales) net_sales = net_sales / 1000000;
    if (operating_income) operating_income = operating_income / 1000000;
    if (ordinary_income) ordinary_income = ordinary_income / 1000000;
    if (net_income) net_income = net_income / 1000000;

    return NextResponse.json({
      company_name: company.company_name,
      period_name: `${report.fiscal_year} ${report.quarter_type || ""}`,
      fiscal_year: parseInt(report.fiscal_year),
      quarter_type: report.quarter_type,
      net_sales,
      operating_income,
      ordinary_income,
      net_income,
      operation_profit_rate,
      ordinary_profit_rate,
      net_profit_rate,
    });
  } catch (error: any) {
    console.error("Failed to fetch financial summary:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
