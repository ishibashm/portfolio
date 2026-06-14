import { NextResponse } from "next/server";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import * as fs from "fs";
import * as path from "path";
import { getMcpClient } from "@/lib/mcp";
import { z } from "zod";

// Initialize Ollama provider
const ollamaProvider = createOpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
});

const googleProvider = createGoogleGenerativeAI({
  apiKey:
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    "",
});

export async function GET() {
  try {
    // 1. ユーザーの現在のプロファイル（抽出されたキーワード）を読み込む
    const dataPath = path.join(process.cwd(), "public", "analytics_data.json");
    let topKeywordsStr = "AI, Programming, Finance";
    if (fs.existsSync(dataPath)) {
      const fileContent = fs.readFileSync(dataPath, "utf-8");
      const data = JSON.parse(fileContent);
      if (data.topKeywords && data.topKeywords.length > 0) {
        topKeywordsStr = data.topKeywords
          .slice(0, 15)
          .map((k: any) => k.text)
          .join(", ");
      }
    }

    // 2. LLM Wiki の Index を読み込む
    let wikiSummary = "No AI organized wiki found yet.";
    const wikiIndexPath = path.join(
      process.cwd(),
      "..",
      "llm-wiki",
      "index.md",
    );
    if (fs.existsSync(wikiIndexPath)) {
      const indexContent = fs.readFileSync(wikiIndexPath, "utf-8");
      wikiSummary = indexContent.substring(0, 500) + "...";
    }

    // 3. MCP サーバーに接続して最新トレンドを動的に取得する (RAG)
    let latestTrends = ``;

    // (A) X MCP サーバーとの接続を試みる
    try {
      const xMcpPromise = getMcpClient(); // default URL (port 8000)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("X MCP Timeout")), 2000),
      );
      const xMcpClient = (await Promise.race([
        xMcpPromise,
        timeoutPromise,
      ])) as any;

      const toolResult = await xMcpClient.callTool({
        name: "searchPostsRecent",
        arguments: {
          query: "AI OR LLM OR Programming lang:ja -is:retweet",
          max_results: 10,
        },
      });
      if (toolResult && toolResult.content && toolResult.content.length > 0) {
        latestTrends += `【X (Twitter) から取得したリアルタイムトレンド】\n${toolResult.content[0].text.substring(0, 1000)}\n\n`;
      }
    } catch (e) {
      console.warn("Could not fetch from X MCP (Skip):", e);
    }

    // (B) Brave Search MCP サーバーとの接続 (もしユーザーが起動していれば)
    try {
      const braveMcpUrl =
        process.env.BRAVE_MCP_SERVER_URL || "http://127.0.0.1:8001/sse";
      const braveMcpPromise = getMcpClient(braveMcpUrl);
      const braveTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Brave MCP Timeout")), 2000),
      );
      const braveClient = (await Promise.race([
        braveMcpPromise,
        braveTimeout,
      ])) as any;

      const braveResult = await braveClient.callTool({
        name: "brave_web_search",
        arguments: { query: "AI Programming trends 2026", count: 5 },
      });
      if (
        braveResult &&
        braveResult.content &&
        braveResult.content.length > 0
      ) {
        latestTrends += `【Brave Search MCP から取得したリアルタイムWebトレンド】\n${braveResult.content[0].text.substring(0, 1000)}\n\n`;
      }
    } catch (be) {
      console.warn("Could not fetch from Brave MCP (Skip):", be);
    }

    // (C) どちらの MCP からも情報が得られなかった場合のフォールバック (ローカルのXポスト履歴 または DB最新記事)
    if (!latestTrends) {
      console.log(
        "MCP servers are down. Falling back to local X bookmarks and recent DB articles...",
      );
      latestTrends = "【ローカルで収集した最新のX(Twitter)ポスト・記事群】\n";
      try {
        const bookmarksPath = path.join(
          process.cwd(),
          "..",
          "..",
          "pinterest",
          "x_bookmarks_data.jsonl",
        );
        if (fs.existsSync(bookmarksPath)) {
          const lines = fs
            .readFileSync(bookmarksPath, "utf-8")
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .slice(-10); // 最新の10件
          for (const line of lines) {
            try {
              const b = JSON.parse(line);
              latestTrends += `- @${b.author || "user"}: "${b.text?.substring(0, 100) || b.title}"\n`;
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn("Failed to read local bookmarks:", e);
      }

      // それでもデータが薄ければ、Web検索を足す
      if (latestTrends.split("\n").length < 3) {
        try {
          const res = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent("AI Programming news 2026")}`,
          );
          const html = await res.text();
          const matches = html.match(
            /<a class="result__snippet[^>]*>(.*?)<\/a>/g,
          );
          if (matches) {
            latestTrends +=
              `\n【Web検索から取得した最新のニューススニペット】\n` +
              matches
                .map((m) => m.replace(/<[^>]+>/g, ""))
                .join("\n")
                .substring(0, 1000);
          }
        } catch (e) {}
      }
    }

    // 4. Gemma4 (または Gemini) にメタ分析を依頼するプロンプト
    const prompt = `あなたは「Katmer Base」の専属AIメタアナリスト（知識のメンター）です。
ユーザーがローカルのナレッジベースに保存している知識プロファイル（頻出キーワード）と、外部の最新トレンド（Xのポスト等）は以下の通りです。

【現在のユーザーの得意な知識領域（トップキーワード）】
${topKeywordsStr}

【LLM Wiki の現在のサマリー（ユーザーの知識体系）】
${wikiSummary}

${latestTrends}

これらを深く分析し、以下の3点について回答してください。
※ 重要：【外部トレンドとのギャップ】を説明する際は、提供された「最新のX(Twitter)ポスト」や「ニューススニペット」の中から必ず実際の文章を \`> 引用\` して、「なぜそれが重要なのか」を具体的に解説してください。抽象的な説明は避けてください。

1. **あなたの現在の強み (Current Strengths)**: キーワードやサマリーから読み取れる、ユーザーが今最も得意としている分野は何か。
2. **外部トレンドとのギャップ (Knowledge Gap)**: 提示された最新ポスト・トレンド記事を具体的に引用しつつ、ユーザーの知識にまだ足りていない空白地帯は何かを指摘してください。
3. **次に学ぶべき推奨テーマ (Next Recommended Topics)**: ギャップを埋めるための具体的なアクションを3つ提案してください。`;

    const useGemini = process.env.USE_GEMINI === "true";
    let modelInstance;

    if (useGemini) {
      modelInstance = googleProvider("gemini-2.5-flash");
    } else {
      const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4:latest";
      modelInstance = ollamaProvider(ollamaModelName);
    }

    // 5. LLMによるテキスト生成
    const { text } = await generateText({
      model: modelInstance as any,
      prompt: prompt,
    });

    return NextResponse.json({
      insightMarkdown: text,
      wikiSummaryPreview: wikiSummary,
    });
  } catch (error) {
    console.error("Failed to generate AI insight", error);
    return NextResponse.json(
      {
        error: "Failed to generate AI insight. Ensure Ollama is running.",
        insightMarkdown:
          "AI メタアナリストに接続できませんでした。ローカルのOllama (Gemma4) が起動しているか確認してください。",
      },
      { status: 500 },
    );
  }
}
