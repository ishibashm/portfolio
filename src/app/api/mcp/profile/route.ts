/**
 * 保存済みプロフィール専用の読み取り口。公開 MCP には DB を混ぜない。
 * OAuth introspection で audience / scope / issuer / client を都度検証し、
 * 本人の user_id だけで読む。Cookie・開発用ログイン・メールによる旧行移行は使わない。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createProfileMcpServer } from "@/lib/mcpProfileServer";
import prisma from "@/lib/prisma";
import { PROFILE_RESOURCE_METADATA, verifyProfileToken } from "@/lib/mcpOAuth";
import { profileMcpEnabled, profileMcpNotFound } from "@/lib/mcpProfileGate";

export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store";
const UNAVAILABLE = "Profile service is temporarily unavailable";

function errorResponse(status: number, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: status === 503 ? -32603 : -32000, message },
      id: null,
    },
    {
      status,
      headers: {
        "Cache-Control": NO_STORE,
        ...(status === 401
          ? {
              "WWW-Authenticate": `Bearer realm="cloud-palette-profile", resource_metadata="${PROFILE_RESOURCE_METADATA}", scope="profiles:read"`,
            }
          : {}),
        ...(status === 405 ? { Allow: "POST" } : {}),
      },
    },
  );
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  // 通常の MCP クライアントは Origin を送らない。あるときだけ厳密に照合。
  if (origin === null) return true;
  if (origin === "https://cloud-palette.com") return true;
  return (
    process.env.NODE_ENV === "development" &&
    (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000")
  );
}

export async function POST(request: Request): Promise<Response> {
  // 公開スイッチが無ければ、認証の案内も出さず存在しない入口として扱う。
  if (!profileMcpEnabled()) return profileMcpNotFound();
  if (!originAllowed(request)) return errorResponse(403, "Forbidden origin");

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(
    /^Bearer[ \t]+([A-Za-z0-9\-._~+/]+=*)$/i,
  )?.[1];
  if (!token) return errorResponse(401, "Unauthorized");

  const identity = await verifyProfileToken(token);
  if (identity.status !== "ok")
    return errorResponse(
      identity.status === "unavailable" ? 503 : 401,
      identity.status === "unavailable" ? UNAVAILABLE : "Unauthorized",
    );
  const userId = identity.userId;

  let server: ReturnType<typeof createProfileMcpServer> | undefined;
  let transport: WebStandardStreamableHTTPServerTransport | undefined;
  try {
    server = createProfileMcpServer(async () => {
      try {
        const config = await prisma.user_configs.findUnique({
          where: { user_id: userId },
          select: { presets: true },
        });
        return config?.presets ?? null;
      } catch {
        // SDK が道具の例外を本文にする場合も、DB の詳細や個人情報を渡さない。
        throw new Error(UNAVAILABLE);
      }
    });
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", NO_STORE);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return errorResponse(503, UNAVAILABLE);
  } finally {
    await transport?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

function methodNotAllowed(request: Request): Response {
  if (!profileMcpEnabled()) return profileMcpNotFound();
  if (!originAllowed(request)) return errorResponse(403, "Forbidden origin");
  return errorResponse(405, "Method not allowed. Use POST.");
}

export async function GET(request: Request): Promise<Response> {
  return methodNotAllowed(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return methodNotAllowed(request);
}
