/**
 * MCP（Model Context Protocol）の入口。Streamable HTTP、stateless。
 *
 * 中身は lib/mcpServer にある。ここは HTTP を受けて transport に渡す
 * だけ。**セッションを持たない**（sessionIdGenerator を渡さない）ので、
 * Cloud Run の複数インスタンスに跨っても壊れない。SSE も使わない
 * （enableJsonResponse）。応答は 1 リクエスト 1 JSON。
 *
 * 認証は掛けない。返すのは匿名で画面から得られる計算だけで、個人
 * データも DB も触らない（lib/mcpServer の註）。site-spec 6 節の
 * 「個人データを返す API は自分で認証すること」に当たらない。
 *
 * GET / DELETE は stateless では意味を持たない（GET は SSE の待受、
 * DELETE はセッション終了）。405 で返す。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcpServer";
import { toLogMessage } from "@/lib/errorMessage";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (e) {
    console.error(`[mcp] ${toLogMessage(e)}`);
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
