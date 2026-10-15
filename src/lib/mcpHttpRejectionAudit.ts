import { McpPrivacyError, type McpAuditStore } from "@/lib/mcpAuditStore";

/** Before JSON-RPC dispatch, neither claimed subjects nor tool names are trusted.
 * Reuse invalid_request for the unclassified HTTP envelope. Never accept a
 * Request, headers, error object or caller-provided identity at this boundary.
 * An exhausted request cannot start more DB work. Persistence must independently
 * bound its I/O: racing a promise does not cancel the underlying database query.
 */
export function createMcpHttpRejectionAudit(deps: {
  audit: Pick<McpAuditStore, "record">;
  monotonicNow?: () => number;
}) {
  const now = deps.monotonicNow ?? (() => performance.now());
  return async function record(
    result: "denied" | "invalid" | "unavailable",
    startedAt: number,
  ): Promise<void> {
    const elapsed = now() - startedAt;
    if (
      !["denied", "invalid", "unavailable"].includes(result) ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed >= 5000
    )
      throw new McpPrivacyError();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new McpPrivacyError()), 5000 - elapsed);
      });
      await Promise.race([
        deps.audit.record({
          userId: null,
          grantId: null,
          event: "invalid_request",
          result,
          durationMs: Math.floor(elapsed),
        }),
        deadline,
      ]);
      const completed = now() - startedAt;
      if (
        !Number.isFinite(completed) ||
        completed < elapsed ||
        completed >= 5000
      )
        throw new McpPrivacyError();
    } catch {
      throw new McpPrivacyError();
    } finally {
      clearTimeout(timer);
    }
  };
}
