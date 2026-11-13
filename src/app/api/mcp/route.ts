/**
 * MCP（Model Context Protocol）の入口。Streamable HTTP、stateless。
 *
 * 中身は lib/mcpServer にある。ここは HTTP を受けて transport に渡す
 * だけ。**セッションを持たない**（sessionIdGenerator を渡さない）ので、
 * Cloud Run の複数インスタンスに跨っても壊れない。SSE も使わない
 * （enableJsonResponse）。応答は 1 リクエスト 1 JSON。
 *
 * 認証は掛けない。計算は DB を読まない。記事と賃貸掲載だけが
 * SELECT する。呼び出し回数の上限だけ、IP・全体・セッション・道具の
 * HMAC を共有の表で数える（表が無い・DB が落ちているときは通す）。
 * 個人データ・お気に入り・連絡先は返さない。
 * スクレイピングは起動しない（lib/mcpServer の註）。site-spec の
 * 「個人データを返す API は自分で認証すること」には当たらない。
 *
 * GET / DELETE は stateless では意味を持たない（GET は SSE の待受、
 * DELETE はセッション終了）。405 で返す。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcpServer";
import {
  applyRateHeaders,
  checkMcpPublicLimit,
  maybeWarmMcpRateDb,
  mcpPublicEnabled,
} from "@/lib/mcpPublicLimit";
import { readBoundedJson, requestLimiter } from "@/lib/requestSecurity";

const limit = requestLimiter(60, 1);
void maybeWarmMcpRateDb();

export const dynamic = "force-dynamic";

const disabledResponse = () =>
  Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "MCP is temporarily disabled" },
      id: null,
    },
    {
      status: 503,
      headers: {
        "Retry-After": "300",
        "Cache-Control": "no-store",
      },
    },
  );

export async function POST(request: Request): Promise<Response> {
  if (!mcpPublicEnabled()) return disabledResponse();
  const denied = limit(request.headers);
  if (denied) return denied;
  const input = await readBoundedJson(request, 256 * 1024);
  if (!input.ok) return input.response;
  const budget = await checkMcpPublicLimit(
    request.headers,
    new Date(),
    input.value,
  );
  if (budget.denied) return budget.denied;
  // The SDK validates the JSON-RPC envelope and each tool's existing Zod schema.
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      parsedBody: input.value,
    });
    return applyRateHeaders(response, budget.headers);
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
  if (!mcpPublicEnabled()) return disabledResponse();
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  if (!mcpPublicEnabled()) return disabledResponse();
  return methodNotAllowed();
}
