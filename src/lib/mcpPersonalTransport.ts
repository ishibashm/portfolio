import type { MemoryStore } from "@/lib/personalMemory";
import type { McpProfileReader } from "@/lib/mcpProfiles";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { McpAuthContext } from "@/lib/mcpAuth";
import type { McpPersonalRequest } from "@/lib/mcpPersonalRequest";
import { createMcpPersonalServer } from "@/lib/mcpPersonalServer";
import { McpGuardError } from "@/lib/mcpPrivacyGuard";

const denial = z.object({
  error: z.object({
    code: z.enum([
      "INVALID_INPUT",
      "NOT_FOUND_OR_CONFLICT",
      "LIMIT_REACHED",
      "PROFILE_NOT_FOUND",
      "AMBIGUOUS_PROFILE",
      "PROFILE_INCOMPLETE",
      "UNSUPPORTED_SETTINGS",
      "TEMPORARILY_UNAVAILABLE",
    ]),
    candidates: z
      .array(
        z.object({
          id: z.string().min(1).max(512),
          name: z.string().min(1).max(100),
        }),
      )
      .max(100)
      .optional(),
  }),
});

/** Internal only. A fresh SDK server/transport for one authenticated request.
 * The caller owns the total deadline, shared rate limit and audit. Never pass
 * credentials, cookies, forwarded headers or the original URL to tool context.
 * Buffer JSON before publishing so SDK validation/exception text cannot escape.
 */
export async function executeMcpPersonalRequest(
  context: McpAuthContext,
  classified: Extract<McpPersonalRequest, { accepted: true }>,
  headers: Headers,
  signal: AbortSignal,
  read?: McpProfileReader,
  memory?: MemoryStore,
) {
  if (signal.aborted) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
  const server = createMcpPersonalServer(context, new Date(), read, memory);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const safeHeaders = new Headers();
  for (const key of ["accept", "content-type", "mcp-protocol-version"])
    if (headers.has(key)) safeHeaders.set(key, headers.get(key)!);
  try {
    await server.connect(transport);
    if (signal.aborted) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    const response = await transport.handleRequest(
      new Request("https://cloud-palette.com/api/mcp/personal", {
        method: "POST",
        headers: safeHeaders,
      }),
      { parsedBody: classified.message },
    );
    if (signal.aborted) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    if (response.status === 202)
      return {
        value: new Response(null, { status: 202 }),
        result: "success" as const,
      };
    // SDK HTTP/protocol errors may contain request values; never forward them.
    if (response.status !== 200) throw new McpGuardError("INVALID_REQUEST");
    const payload = await response.json();
    if (payload.error) throw new McpGuardError("INVALID_REQUEST");
    if (payload.result?.isError) {
      const text = payload.result.content?.[0]?.text;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* SDK errors are plain text. */
      }
      const known = denial.safeParse(parsed);
      let code = known.success ? known.data.error.code : undefined;
      if (
        !code &&
        typeof text === "string" &&
        text.startsWith("MCP error -32602: Input validation error:")
      )
        code = "INVALID_INPUT";
      // Existing public tools predate structured errors. Recognize only their
      // fixed validation messages; never return their interpolated input text.
      if (
        !code &&
        typeof text === "string" &&
        ([
          "birthDate は YYYY-MM-DD で指定してください。",
          "date は YYYY-MM-DD で指定してください。",
          "from は YYYY-MM-DD で指定してください。",
          "lon（出発地の経度）は数値で指定してください。",
        ].includes(text) ||
          /^コード [0-9]{5} の市区町村は掲載の集計がありません。search_municipality で確かめてください。$/.test(
            text,
          ) ||
          /^県コード [0-9]{2} が分かりません。$/.test(text))
      )
        code = "INVALID_INPUT";
      if (!code || code === "TEMPORARILY_UNAVAILABLE")
        throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      const error = {
        code,
        message: code,
        ...(code === "AMBIGUOUS_PROFILE" && known.success
          ? {
              candidates: known.data.error.candidates?.filter((candidate) =>
                context.allowedProfileIds.includes(candidate.id),
              ),
            }
          : {}),
      };
      return {
        value: Response.json({
          jsonrpc: "2.0",
          id: "id" in classified.message ? classified.message.id : null,
          result: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error }) }],
          },
        }),
        result:
          code === "INVALID_INPUT" ? ("invalid" as const) : ("denied" as const),
      };
    }
    return { value: Response.json(payload), result: "success" as const };
  } catch (error) {
    if (error instanceof McpGuardError) throw error;
    throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
  } finally {
    // Keep the calculation lease until real work settles; closing the SDK does
    // not forcibly terminate JS or a DB query. The outer guard enforces timeout.
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
