/**
 * MCP（Model Context Protocol）の入口。Streamable HTTP、stateless。
 *
 * 中身は lib/mcpServer にある。ここは HTTP を受けて transport に渡す
 * だけ。**セッションを持たない**（sessionIdGenerator を渡さない）ので、
 * Cloud Run の複数インスタンスに跨っても壊れない。SSE も使わない
 * （enableJsonResponse）。応答は 1 リクエスト 1 JSON。
 *
 * 認証は掛けない。計算は DB を読まない。記事と賃貸掲載だけが
 * SELECT する。個人データ・お気に入り・連絡先は返さない。
 * スクレイピングは起動しない（lib/mcpServer の註）。site-spec の
 * 「個人データを返す API は自分で認証すること」には当たらない。
 *
 * GET / DELETE は stateless では意味を持たない（GET は SSE の待受、
 * DELETE はセッション終了）。405 で返す。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcpServer";
import { readBoundedJson, requestLimiter } from "@/lib/requestSecurity";

const limit = requestLimiter(60, 1);

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = limit(request.headers);
  if (denied) return denied;
  const input = await readBoundedJson(request, 256 * 1024);
  if (!input.ok) return input.response;
  // The SDK validates the JSON-RPC envelope and each tool's existing Zod schema.
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: input.value });
  } catch {
    console.error("[mcp] Internal error");
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: null,
      },
      { status: 500 },
    );
  } finally {
    /* リクエストごとに使い捨て。閉じないと接続が残る */
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}

const methodNotAllowed = () =>
  Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. This server is stateless; use POST.",
      },
      id: null,
    },
    { status: 405, headers: { Allow: "POST" } },
  );

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
