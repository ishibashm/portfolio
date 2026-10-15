import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  McpConnectionError,
  type createMcpConnectionService,
} from "@/lib/mcpConnections";
import { createMcpSiteLoginVerifier } from "@/lib/mcpSiteLogin";
import { MCP_AUTHORIZATION_ISSUER } from "@/lib/mcpDiscovery";

const ORIGIN = new URL(MCP_AUTHORIZATION_ISSUER).origin;
const HOST = new URL(ORIGIN).host;
const PATH = "/api/mcp/connections";
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke"), connectionId: z.uuid() }).strict(),
  z.object({ action: z.literal("revokeAll") }).strict(),
  z
    .object({
      action: z.literal("reduceProfiles"),
      connectionId: z.uuid(),
      profileIds: z.array(z.string().min(1).max(512)).min(1).max(100),
    })
    .strict(),
]);

async function readMutation(req: IncomingMessage) {
  if (
    !/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      req.headers["content-type"] ?? "",
    ) ||
    req.headers["content-encoding"] ||
    Number(req.headers["content-length"] ?? 0) > 32768
  )
    throw new McpConnectionError("INVALID_REQUEST");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 32768) throw new McpConnectionError("INVALID_REQUEST");
    chunks.push(bytes);
  }
  try {
    return mutation.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new McpConnectionError("INVALID_REQUEST");
  }
}

/** Dormant Node adapter for the same canonical site host as the AS. No route,
 * listener, global client or environment toggle is installed. Mount only after
 * audit/limits, management UI and end-to-end release gates are complete. */
export function createMcpConnectionsHandler(deps: {
  service: ReturnType<typeof createMcpConnectionService>;
  login: Parameters<typeof createMcpSiteLoginVerifier>[0];
}) {
  const verifySiteUser = createMcpSiteLoginVerifier(deps.login);
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Cookie");
    try {
      const url = new URL(req.url ?? "", ORIGIN);
      if (
        req.headers.host !== HOST ||
        url.origin !== ORIGIN ||
        url.pathname !== PATH ||
        url.hash ||
        (req.headers["x-forwarded-host"] &&
          req.headers["x-forwarded-host"] !== HOST) ||
        (req.headers["x-forwarded-proto"] &&
          req.headers["x-forwarded-proto"] !== "https")
      )
        throw new McpConnectionError("INVALID_REQUEST");
      if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        res.writeHead(405).end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
        return;
      }
      // Fail closed for cross-site reads too. CSRF protection for writes requires
      // exact canonical Origin plus a custom header and JSON (no simple forms).
      if (
        (req.headers.origin && req.headers.origin !== ORIGIN) ||
        (req.headers["sec-fetch-site"] &&
          req.headers["sec-fetch-site"] !== "same-origin") ||
        (req.method === "POST" &&
          (req.headers.origin !== ORIGIN ||
            req.headers["x-mcp-management"] !== "1"))
      )
        throw new McpConnectionError("INVALID_REQUEST");
      if (!req.headers.cookie) throw new McpConnectionError("LOGIN_REQUIRED");
      const userId = await verifySiteUser(req, res);
      if (!userId) throw new McpConnectionError("LOGIN_REQUIRED");
      let result;
      if (req.method === "GET") {
        if (
          [...url.searchParams.keys()].some((key) => key !== "after") ||
          url.searchParams.getAll("after").length > 1
        )
          throw new McpConnectionError("INVALID_REQUEST");
        result = await deps.service.list(
          userId,
          url.searchParams.get("after") ?? undefined,
        );
      } else {
        if (url.search) throw new McpConnectionError("INVALID_REQUEST");
        const input = await readMutation(req);
        result =
          input.action === "revokeAll"
            ? await deps.service.revokeAll(userId)
            : input.action === "revoke"
              ? await deps.service.revoke(userId, input.connectionId)
              : await deps.service.reduceProfiles(
                  userId,
                  input.connectionId,
                  input.profileIds,
                );
      }
      res.writeHead(200).end(JSON.stringify(result));
    } catch (error) {
      const code =
        error instanceof McpConnectionError
          ? error.code
          : "TEMPORARILY_UNAVAILABLE";
      res
        .writeHead(
          code === "LOGIN_REQUIRED"
            ? 401
            : code === "NOT_FOUND"
              ? 404
              : code === "INVALID_REQUEST"
                ? 400
                : 503,
        )
        .end(JSON.stringify({ error: code }));
    }
  };
}
