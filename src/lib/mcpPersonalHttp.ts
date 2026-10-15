import type { McpProfileReader } from "@/lib/mcpProfiles";
import type { McpAuditStore } from "@/lib/mcpAuditStore";
import { createMcpHttpRejectionAudit } from "@/lib/mcpHttpRejectionAudit";
import {
  McpAuthError,
  type McpAuthContext,
  type McpAuthBudget,
} from "@/lib/mcpAuth";
import type { createMcpDiscoveryContract } from "@/lib/mcpDiscovery";
import {
  createMcpPrivacyGuard,
  McpGuardError,
  readMcpPersonalBody,
} from "@/lib/mcpPrivacyGuard";
import { classifyMcpPersonalRequest } from "@/lib/mcpPersonalRequest";
import { executeMcpPersonalRequest } from "@/lib/mcpPersonalTransport";

const noStore = { "Cache-Control": "private, no-store" };
function failure(status: number, code: string, headers?: HeadersInit) {
  return Response.json(
    { error: code },
    {
      status,
      headers: { ...noStore, ...Object.fromEntries(new Headers(headers)) },
    },
  );
}

/** Internal composition only: the public route remains a hard 404.
 * Inject the local-provider authenticator and shared DB guard, never cookie
 * authentication. Every POST authenticates anew, including discovery/notification.
 * Deployment still needs pre-auth ingress limits and bounded, non-logging DB I/O.
 */
export function createMcpPersonalHttp(deps: {
  authenticate: (
    headers: Headers,
    budget: McpAuthBudget,
  ) => Promise<McpAuthContext>;
  // Required even when a request only lists tools. No site DB fallback.
  profileReader: (
    signal: AbortSignal,
    remainingMs: () => number,
  ) => McpProfileReader;
  run: ReturnType<typeof createMcpPrivacyGuard>;
  audit: Pick<McpAuditStore, "record">;
  discovery: Pick<
    ReturnType<typeof createMcpDiscoveryContract>,
    "unauthorizedResponse"
  >;
  allowedOrigins?: readonly string[];
  // Must be the same monotonic clock as the guard; only injected in tests.
  monotonicNow?: () => number;
}) {
  if (typeof deps.profileReader !== "function")
    throw new Error("MCP_PROFILE_READER_REQUIRED");
  if (typeof deps.audit?.record !== "function")
    throw new Error("MCP_HTTP_AUDIT_REQUIRED");
  const origins = new Set(deps.allowedOrigins ?? ["https://cloud-palette.com"]);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin)
      throw new Error("MCP_ORIGIN_CONFIGURATION_INVALID");
  }
  const now = deps.monotonicNow ?? (() => performance.now());
  const auditRejection = createMcpHttpRejectionAudit({
    audit: deps.audit,
    monotonicNow: now,
  });
  return async function handle(request: Request): Promise<Response> {
    const startedAt = now();
    if (!Number.isFinite(startedAt))
      return failure(503, "TEMPORARILY_UNAVAILABLE");
    const rejectEnvelope = async (
      result: "denied" | "invalid",
      response: Response,
    ) => {
      try {
        await auditRejection(result, startedAt);
        return response;
      } catch {
        return failure(503, "TEMPORARILY_UNAVAILABLE");
      }
    };
    if (request.method !== "POST")
      return rejectEnvelope(
        "invalid",
        failure(405, "METHOD_NOT_ALLOWED", { Allow: "POST" }),
      );
    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin))
      return rejectEnvelope("denied", failure(403, "ORIGIN_DENIED"));
    const controller = new AbortController();
    let guardStarted = false;
    let rejectDeadline: (error: McpGuardError) => void;
    const deadline = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
    });
    const abort = () => {
      controller.abort();
      rejectDeadline(new McpGuardError("TEMPORARILY_UNAVAILABLE"));
    };
    const timer = setTimeout(abort, 5000);
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const check = () => {
      const elapsed = now() - startedAt;
      if (
        controller.signal.aborted ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed >= 5000
      )
        throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    };
    const operation = (async () => {
      check();
      // Only the Bearer header crosses the auth boundary, never site cookies.
      const authHeaders = new Headers();
      if (request.headers.has("authorization"))
        authHeaders.set("authorization", request.headers.get("authorization")!);
      const context = await deps.authenticate(authHeaders, {
        signal: controller.signal,
        remainingMs: () => {
          check();
          return Math.max(0, 5000 - (now() - startedAt));
        },
      });
      check();
      let body: string;
      try {
        body = await readMcpPersonalBody(request, controller.signal);
      } catch (error) {
        check();
        guardStarted = true;
        return deps.run<Response>(
          context,
          "invalid_request",
          async () => {
            throw error;
          },
          { startedAt, signal: controller.signal },
        );
      }
      check();
      const classified = classifyMcpPersonalRequest(body);
      guardStarted = true;
      return deps.run(
        context,
        classified.event,
        async (signal) => {
          if (!classified.accepted) throw new McpGuardError("INVALID_REQUEST");
          return executeMcpPersonalRequest(
            context,
            classified,
            request.headers,
            signal,
            async (userId) => {
              check();
              const read = deps.profileReader(signal, () => {
                check();
                return Math.max(0, 5000 - (now() - startedAt));
              });
              const row = await read(userId);
              check();
              return row;
            },
          );
        },
        { startedAt, signal: controller.signal },
      );
    })();
    try {
      const response = await Promise.race([operation, deadline]);
      check();
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      // The execution guard owns audit after dispatch. Do not duplicate its
      // records or attribute pre-dispatch failures to a claimed token subject.
      if (!guardStarted && !controller.signal.aborted) {
        try {
          await auditRejection(
            error instanceof McpAuthError &&
              error.code !== "TEMPORARILY_UNAVAILABLE"
              ? "denied"
              : "unavailable",
            startedAt,
          );
        } catch {
          return failure(503, "TEMPORARILY_UNAVAILABLE");
        }
      }
      if (controller.signal.aborted)
        return failure(503, "TEMPORARILY_UNAVAILABLE");
      if (
        error instanceof McpAuthError &&
        error.code !== "TEMPORARILY_UNAVAILABLE"
      )
        return deps.discovery.unauthorizedResponse(
          error.code === "INSUFFICIENT_SCOPE"
            ? "insufficient_scope"
            : "invalid_token",
        );
      if (error instanceof McpGuardError)
        return failure(
          error.status,
          error.code,
          error.code === "RATE_LIMITED"
            ? { "Retry-After": String(error.retryAfterSeconds ?? 1) }
            : undefined,
        );
      return failure(503, "TEMPORARILY_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    }
  };
}
