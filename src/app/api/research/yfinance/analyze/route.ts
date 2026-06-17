import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export async function POST(req: Request) {
  try {
    const { meta, metrics, recentHistory } = await req.json();

    if (!metrics || !meta) {
      return NextResponse.json(
        { success: false, error: "Metrics and meta data are required" },
        { status: 400 },
      );
    }

    // Ensure Gemini API Key is configured in environment
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }

    const systemPrompt = `
あなたはゴールドマン・サックス（Goldman Sachs）のグローバル・マーケッツ部門に所属するシニア・クオンツ・ストラテジストです。
提供された個別銘柄のクオンツ統計指標、基本情報、および直近の株価データに基づき、プロフェッショナルで統計的な「Quant Research & Strategy Report」を生成してください。

# 期待する出力（日本語、Markdown形式）
1. ## Executive Summary
   - 銘柄のクオンツ的特徴（高ボラティリティか、安定的な高シャープレシオかなど）の要約。
2. ## Statistical Risk Profile
   - ボラティリティ、最大ドローダウン、Value at Risk (VaR 95%) の分析。
   - 歪度 (Skewness) と 尖度 (Kurtosis) から読み解くリターンの分布特性（テールリスク、非対称性）。
3. ## Quant Trading Strategy (Alpha Hypothesis)
   - この銘柄の統計的特性を活かした具体的なトレード仮説（エントリー／エグジットの条件、移動平均やボリンジャーバンドを用いたアプローチなど）。
   - 優位性（エッジ）が生まれやすい市場環境。
4. ## Risk Mitigation & Tail Risk Management
   - この戦略における具体的なリスクシナリオと、VaRに基づいた適切なポジションサイジング、損切りロジック。
5. ## Further Backtest Variables
   - この仮説を補強するために今後バックテストすべき変数やパラメータ（例：RSIのしきい値、ボリンジャーバンドの期間調整など）。

プロフェッショナルかつ説得力のある、データに基づいたトーンで記述してください。
`;

    const promptContext = `
## Ticker Meta Info
- Name: ${meta.name} (${meta.symbol})
- Sector: ${meta.sector}
- Industry: ${meta.industry}
- Market Cap: ${meta.market_cap ? (meta.market_cap / 1e9).toFixed(2) + " B " + meta.currency : "N/A"}
- P/E Ratio: ${meta.pe_ratio || "N/A"}

## Quant Metrics (Calculated over 2 years)
- Annualized Return: ${(metrics.annualized_return * 100).toFixed(2)}%
- Annualized Volatility: ${(metrics.annualized_volatility * 100).toFixed(2)}%
- Sharpe Ratio: ${metrics.sharpe_ratio}
- Maximum Drawdown: ${(metrics.max_drawdown * 100).toFixed(2)}%
- 1-Day VaR (95% Historical): ${(metrics.var_historical_95 * 100).toFixed(2)}%
- 1-Day VaR (95% Parametric): ${(metrics.var_parametric_95 * 100).toFixed(2)}%
- Skewness (歪度): ${metrics.skewness}
- Kurtosis (尖度): ${metrics.kurtosis}

## Recent Close Prices (Last 5 periods)
${JSON.stringify(recentHistory || [], null, 2)}
`;

    const { text } = await generateText({
      model: google("gemini-2.5-pro"),
      system: systemPrompt,
      prompt: `以下のデータを徹底分析し、クオンツ・レポートを生成してください：\n\n${promptContext}`,
    });

    return NextResponse.json({ success: true, report: text });
  } catch (error: any) {
    console.error("Quant Analyze API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
