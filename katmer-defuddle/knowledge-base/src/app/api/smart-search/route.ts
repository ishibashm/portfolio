import { streamText, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { searchInternalKnowledge, searchWebLatest } from "@/lib/vector-search";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

// Configure Ollama via OpenAI compatible endpoint
const ollama = createOpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
});

// Configure Gemini
const apiKey =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const google = createGoogleGenerativeAI({ apiKey });

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const { messages } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  const lastUserMessage = messages[messages.length - 1];
  let searchQuery = "メンタルクリニック";
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === "string") {
      searchQuery = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      const textPart = lastUserMessage.content.find(
        (p: any) => p.type === "text",
      );
      if (textPart) searchQuery = textPart.text;
    } else if (lastUserMessage.text) {
      searchQuery = lastUserMessage.text;
    } else if (Array.isArray(lastUserMessage.parts)) {
      const textPart = lastUserMessage.parts.find(
        (p: any) => p.type === "text",
      );
      if (textPart) searchQuery = textPart.text;
    } else {
      const str = JSON.stringify(lastUserMessage);
      const match = str.match(/"text":"([^"]+)"/);
      if (match) searchQuery = match[1];
    }
  }

  // 検索クエリの簡略化
  const optimizedQuery =
    searchQuery.length > 200 ? searchQuery.substring(0, 200) : searchQuery;

  // 1. サーバー側で強制的にナレッジベースを検索（サーバーサイドRAG）
  console.log(
    `[Server-Side RAG] Executing vector search for: ${optimizedQuery}`,
  );
  let contextText = "内部ナレッジベースからは関連情報が見つかりませんでした。";
  let webContextText = "Web検索結果がありませんでした。";

  try {
    const results = await searchInternalKnowledge(optimizedQuery, 5, userId);
    if (results && results.length > 0) {
      const hasGoodMatch = results.some((r) => r.similarity > 0.35);

      contextText = results
        .map(
          (r) =>
            `Title: ${r.title}\nSimilarity: ${r.similarity.toFixed(4)}\nContent: ${r.content.substring(0, 4000)}...`,
        )
        .join("\n\n---\n\n");

      if (!hasGoodMatch) {
        contextText =
          "⚠️ 内部ナレッジベースに直接一致する情報は少ないようです。以下の参考情報を確認してください：\n\n" +
          contextText;
      }
    }
  } catch (error) {
    console.error("Vector search failed in route.ts:", error);
    contextText = "(内部検索エラーが発生しました)";
  }

  // 2. Web検索も実行して補完する
  try {
    console.log(
      `[Server-Side RAG] Executing web search for: ${optimizedQuery}`,
    );
    webContextText = await searchWebLatest(optimizedQuery);
  } catch (error) {
    console.error("Web search failed in route.ts:", error);
    webContextText = "(Web検索エラーが発生しました)";
  }

  // 3. システムプロンプトに検索結果を埋め込む
  const systemPrompt = `
あなたは非常に高度で網羅的な検索・提案を行うアシスタントです。
ユーザーからの質問や要望に対し、提供された【ナレッジベース検索結果】と【Web検索結果】の情報をもとに多角的な視点で分析し、最適なアクションを提案してください。

【回答の構成案】
1. **現状の整理**: 検索結果から得られた事実をまとめます。
2. **多角的分析**: 専門家（医師、カウンセラー、社会福祉士、戦略家など）の視点で分析します。
3. **具体的なアクション提案**: 今後のステップや具体的なアドバイスを提示します。

【重要・厳守】
- **必ず**提供された検索結果（内部およびWeb）の情報に基づいて回答を作成してください。
- 検索結果にない情報を勝手に作り出さないでください。情報が不足している場合は、正直にその旨を伝えた上で、一般的なアドバイスであることを明記してください。
- ナレッジベースの情報を優先して活用し、ユーザーのコンテキストに合わせた回答を心がけてください。

回答は日本語で、Markdownを活用して読みやすくリッチなフォーマットで出力してください。

【ナレッジベース検索結果（あなたの個人ナレッジ）】
\${contextText}

【Web検索結果（最新の一般情報）】
\${webContextText}
`;

  // Use Gemini if USE_GEMINI=true is set, otherwise use Ollama with the specified model
  const useGemini = process.env.USE_GEMINI === "true";
  const ollamaModelName = process.env.OLLAMA_MODEL || "qwen3.6:35b";
  const activeModel =
    useGemini && apiKey
      ? (google("gemini-2.5-flash") as any)
      : ollama(ollamaModelName);

  // 過去の会話履歴を直近5件に絞る
  const recentMessages = modelMessages.slice(-5);

  const result = streamText({
    model: activeModel,
    system: systemPrompt,
    messages: recentMessages,
  });

  return result.toUIMessageStreamResponse();
}
