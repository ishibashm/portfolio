import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getUserApiKey } from "@/app/settings/actions";

export async function POST(request: Request) {
  try {
    const { query, contexts } = await request.json();
    if (!query)
      return NextResponse.json({ error: "Query is required" }, { status: 400 });

    const prompt = `
ユーザーは社内/個人知識ベースで以下の検索キーワードを入力しました: "${query}"

検索にヒットしたドキュメントの一部抜粋:
${contexts?.substring(0, 3000) || "ヒットなし"}

上記を踏まえ、以下の2点を提供してください。フォーマットは厳密にJSONで返してください。
1. suggestions: ユーザーがさらに深掘りしたくなりそうな関連検索キーワード（3〜5個）。単語や短いフレーズで。
2. summary: ヒットした内容全体から言えることの簡単なAI要約（150文字程度。該当なしの場合は一般的な推測や説明）。

JSON format:
{
  "suggestions": ["keyword1", "keyword2", "keyword3"],
  "summary": "..."
}
`;

    const useGemini = process.env.USE_GEMINI === "true";
    let aiResponseText = "";

    if (useGemini) {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const userKey = await getUserApiKey();
      const google = createGoogleGenerativeAI({
        apiKey:
          userKey ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          "",
      });
      const res = await generateText({
        model: google("gemini-2.5-flash") as any,
        prompt,
      });
      aiResponseText = res.text;
    } else {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const ollamaProvider = createOpenAI({
        baseURL: process.env.OLLAMA_HOST
          ? `${process.env.OLLAMA_HOST}/v1`
          : "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
      });
      const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4";
      const res = await generateText({
        model: ollamaProvider(ollamaModelName) as any,
        prompt,
      });
      aiResponseText = res.text;
    }

    // Extract JSON from markdown code block if present
    const startIndex = aiResponseText.indexOf("{");
    const endIndex = aiResponseText.lastIndexOf("}");

    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = aiResponseText.substring(startIndex, endIndex + 1);
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } else {
      return NextResponse.json({
        suggestions: [],
        summary: "Failed to generate summary.",
      });
    }
  } catch (error: any) {
    console.error("AI Suggestions Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
