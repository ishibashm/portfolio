import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { meta, metrics, aiReport, history } = await req.json();

    if (!meta || !metrics) {
      return NextResponse.json(
        { error: "Meta and metrics data are required" },
        { status: 400 },
      );
    }

    // Generate formatted Markdown content
    const dateStr = new Date().toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Generate Recent stock prices table (last 30 rows)
    const recentHistory = (history || []).slice(-30).reverse();
    let historyTable = "| 日付 | 始値 | 高値 | 安値 | 終値 | 出来高 | PER | PBR |\n|---|---|---|---|---|---|---|---|\n";
    for (const h of recentHistory) {
      const perVal = h.per ? h.per.toFixed(2) : "-";
      const pbrVal = h.pbr ? h.pbr.toFixed(2) : "-";
      const volVal = h.volume ? h.volume.toLocaleString() : "-";
      historyTable += `| ${h.date} | ${h.open?.toLocaleString() || "-"} | ${h.high?.toLocaleString() || "-"} | ${h.low?.toLocaleString() || "-"} | ${h.close?.toLocaleString() || "-"} | ${volVal} | ${perVal} | ${pbrVal} |\n`;
    }

    const markdownContent = `# Quant Research Report: ${meta.name} (${meta.symbol})
**作成日**: ${dateStr}
**セクター**: ${meta.sector} | **業界**: ${meta.industry}
**時価総額**: ${meta.market_cap ? (meta.market_cap / 1e9).toFixed(2) + " B " + meta.currency : "N/A"}

---

## 📊 クオンツ統計指標 (Quant Metrics)
- **年率リターン (Annualized Return)**: ${(metrics.annualized_return * 100).toFixed(2)}%
- **年率ボラティリティ (Annualized Volatility)**: ${(metrics.annualized_volatility * 100).toFixed(2)}%
- **シャープレシオ (Sharpe Ratio)**: ${metrics.sharpe_ratio.toFixed(2)}
- **最大ドローダウン (Max Drawdown)**: ${(metrics.max_drawdown * 100).toFixed(2)}%
- **Value at Risk (95% ヒストリカル)**: ${(metrics.var_historical_95 * 100).toFixed(2)}%
- **Value at Risk (95% パラメトリック)**: ${(metrics.var_parametric_95 * 100).toFixed(2)}%
- **歪度 (Skewness)**: ${metrics.skewness.toFixed(3)}
- **尖度 (Kurtosis)**: ${metrics.kurtosis.toFixed(3)}

---

## 📅 直近30営業日の株価時系列データ (Valuation Data Included)
${historyTable}

---

## 🧠 AI クオンツ・インサイト (AI Strategy Insights)
${aiReport || "AIインサイトは生成されませんでした。"}
`;

    // Save to database
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: `Quant Analysis: ${meta.name} (${meta.symbol})`,
        content: markdownContent,
        domain: "financial",
        category: "Quant Research",
        type: "Note",
        status: "Published",
        priority: "High",
      },
    });

    const formattedKbId = `KB${document.kb_id.toString().padStart(6, "0")}`;

    return NextResponse.json({
      success: true,
      kb_id: formattedKbId,
      title: document.title,
    });
  } catch (error) {
    console.error("Error saving quant note to KB:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save quant note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
