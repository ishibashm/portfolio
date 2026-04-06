import "dotenv/config";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getQuotes, getFinancialStatements } from "./jquants_api.js";
import fs from "fs";
import path from "path";

// Main function to run research
async function main() {
  console.log("=== AI Quant Researcher (JQuants + Gemini) ===");

// Set up Gemini API Key from existing GEMINI_API_KEY if needed
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
  }

  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: Missing JQUANTS_API_KEY in .env");
    console.log("Please add JQUANTS_API_KEY=\"your_v2_api_key\" to your .env file.");
    process.exit(1);
  }

  try {
    console.log("🔑 Authenticating with JQuants API V2...");

    // TARGET STOCKS (Let's research Toyota: 72030 or Sony: 67580)
    // Note: JQuants requires 5 digit code (with trailing zero for standard stocks)
    const TARGET_CODE = "72030";
    const FROM_DATE = "20240110";
    const TO_DATE = "20251231";

    console.log(`📈 Fetching daily quotes for ${TARGET_CODE} (${FROM_DATE} - ${TO_DATE})...`);
    const quotes = await getQuotes(TARGET_CODE, undefined, FROM_DATE, TO_DATE, apiKey);
    
    // Sub-sample to avoid huge payload, maybe weekly close prices or last N days
    const recentQuotes = quotes.slice(-60); // Last 60 trading days
    
    console.log(`📑 Fetching financial statements for ${TARGET_CODE}...`);
    // Not filtering by date so it gets recent ones (JQuants returns multiple past quarters if we don't filter carefully)
    let statements = await getFinancialStatements(TARGET_CODE, undefined, apiKey);
    // Grab the last 4 quarters to give the AI context of growth
    const recentStatements = statements.slice(-4);

    console.log("🧠 Formatting data for AI analysis...");
    const dataContext = `
# Target Code: ${TARGET_CODE}

## Recent Quotes (Last 60 Days, sample)
${JSON.stringify(
  recentQuotes.map((q: any) => ({
    Date: q.Date,
    Open: q.O,
    High: q.H,
    Low: q.L,
    Close: q.C,
    Volume: q.Vo,
  })),
  null,
  2
)}

## Recent Financial Statements (Last 4 items)
${JSON.stringify(
  recentStatements.map((s: any) => ({
    DiscloseDate: s.DiscloseDate,
    NetSales: s.NetSales,
    OperatingProfit: s.OperatingProfit,
    OrdinaryProfit: s.OrdinaryProfit,
    Profit: s.Profit,
    EarningsPerShare: s.EarningsPerShare,
    EquityToAssetRatio: s.EquityToAssetRatio
  })),
  null,
  2
)}
`;

    console.log("💬 Sending data to Gemini AI for Hypothesis Generation...");
    
    // We prompt the AI to act as a Quant Researcher
    const systemPrompt = `
あなたは世界トップクラスのクオンツ・リサーチャーです。
提供された日本の個別銘柄（株価推移および四半期財務データ）を分析し、**「今後、このようなチャートや財務の変化をした銘柄を見つけたら買うべき（または売るべき）」という勝率の高いアルファ（投資ルール・仮説）**を提示してください。

# 期待する出力（マークダウン形式）
1. **データ分析の要約**: 株価トレンドと業績トレンドの簡潔なまとめ。
2. **発見されたアルファ（有効な指標の組み合わせ）**: どういう条件が揃ったときにエッジ（優位性）が生まれるかの仮説。「例：営業利益が前年比◯%増だが、株価が直近の高値から◯%押し目を作っている時」など。
3. **リスクと注意点**: このルールが機能しないかもしれないマクロ環境や条件。
4. **次の検証ステップ**: バックテストでさらに検証すべきパラメータ。
`;

    const { text: result } = await generateText({
      model: google("gemini-2.5-pro"),
      system: systemPrompt,
      prompt: `以下のデータを分析してレポートを作成してください：\n\n${dataContext}`
    });

    console.log("\n==================================");
    console.log("📊 AI Quant Researcher Final Report");
    console.log("==================================\n");
    console.log(result);
    
    // Save report to file
    const reportDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filepath = path.join(reportDir, `report_${TARGET_CODE}_${timestamp}.md`);
    fs.writeFileSync(filepath, result, "utf-8");
    console.log(`\n💾 Report saved to ${filepath}`);

  } catch (error) {
    console.error("❌ Execution Error:", error);
  }
}

main();
