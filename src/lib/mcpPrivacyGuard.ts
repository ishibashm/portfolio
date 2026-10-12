import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpAuthContext } from "@/lib/mcpAuth";
import {
  mcpAuditEvent,
  mcpAuditResult,
  type McpAuditStore,
} from "@/lib/mcpAuditStore";
import type { McpRateStore } from "@/lib/mcpRateStore";

export class McpGuardError extends Error {
  constructor(
    public readonly code:
      | "RATE_LIMITED"
      | "TEMPORARILY_UNAVAILABLE"
      | "INVALID_REQUEST"
      | "PAYLOAD_TOO_LARGE",
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "McpGuardError";
  }
  get status() {
    return this.code === "RATE_LIMITED"
      ? 429
      : this.code === "PAYLOAD_TOO_LARGE"
        ? 413
        : this.code === "INVALID_REQUEST"
          ? 400
          : 503;
  }
}

/** Read raw bytes, not JS string length. Call inside run's deadline, before JSON
 * parsing. The HTTP adapter must reject batches and validate JSON-RPC separately.
 */
export async function readMcpPersonalBody(
  request: Request,
  signal: AbortSignal,
) {
  const max = 32 * 1024;
  const declared = request.headers.get("content-length");
  const encoding = request.headers.get("content-encoding");
  if (
    (encoding && encoding !== "identity") ||
    (declared !== null && !/^\d+$/.test(declared))
  )
    throw new McpGuardError("INVALID_REQUEST");
  if (declared !== null && Number(declared) > max)
    throw new McpGuardError("PAYLOAD_TOO_LARGE");
  if (!request.body) throw new McpGuardError("INVALID_REQUEST");
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    throw new McpGuardError("INVALID_REQUEST");
  }
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      if (signal.aborted) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      const { value, done } = await reader.read();
      if (signal.aborted) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new McpGuardError("PAYLOAD_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    cancel();
    if (error instanceof McpGuardError) throw error;
    throw new McpGuardError("INVALID_REQUEST");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Unmounted, per-request execution boundary. Only authenticated internal context
 * enters here; no body/arguments/result/credential is passed to either store.
 * One run per HTTP request, after its fixed event has been validated.
 * HTTP callers pass their original monotonic start and cancellation signal;
 * authentication/body reading must not grant another five seconds here. Unknown
 * methods/tools must be rejected by the HTTP dispatcher, never used as events.
 *
 * Async work must honor the signal and use bounded DB operations. JS cannot
 * forcibly interrupt synchronous work: elapsed time is checked before returning.
 * Timeout does not free a still-running calculation's lease. The 30s crash TTL
 * is a recovery bound, not permission for work to continue after the 5s deadline.
 */
export function createMcpPrivacyGuard(deps: {
  audit: Pick<McpAuditStore, "record">;
  rate: Pick<McpRateStore, "reserve" | "release">;
  monotonicNow?: () => number;
}) {
  const now = deps.monotonicNow ?? (() => performance.now());
  return async function run<T>(
    context: McpAuthContext,
    event: z.infer<typeof mcpAuditEvent>,
    work: (
      signal: AbortSignal,
    ) => Promise<{ value: T; result: z.infer<typeof mcpAuditResult> }>,
    budget?: { startedAt: number; signal: AbortSignal },
  ): Promise<T> {
    if (
      !z.uuid().safeParse(context.userId).success ||
      !z.uuid().safeParse(context.grantId).success ||
      !mcpAuditEvent.safeParse(event).success
    )
      throw new McpGuardError("INVALID_REQUEST");
    // Snapshot immutable identifiers before the first await.
    const { userId, grantId } = context;
    const requestId = randomUUID();
    const timeCalculation = event === "judge_time_slots";
    const started = budget?.startedAt ?? now();
    if (!Number.isFinite(started))
      throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    const controller = new AbortController();
    let settledWork: Promise<unknown> = Promise.resolve();
    let acquired = false;
    let recorded = false;
    let result: z.infer<typeof mcpAuditResult> = "unavailable";
    const elapsed = () => {
      const value = now() - started;
      if (!Number.isFinite(value) || value < 0)
        throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      return Math.min(2_147_483_647, Math.floor(value));
    };
    const record = () => {
      recorded = true;
      return deps.audit.record({
        userId,
        grantId,
        event,
        result,
        durationMs: elapsed(),
      });
    };
    // Refuse exhausted/cancelled requests before touching shared stores.
    const remaining = 5000 - (now() - started);
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > 5000 ||
      budget?.signal.aborted
    )
      throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    let rejectDeadline: (error: McpGuardError) => void;
    const deadline = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
    });
    const abort = () => {
      controller.abort();
      result = "unavailable";
      rejectDeadline(new McpGuardError("TEMPORARILY_UNAVAILABLE"));
    };
    budget?.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, remaining);
    const execution = (async () => {
      try {
        const decision = await deps.rate.reserve({
          userId,
          requestId,
          timeCalculation,
        });
        if (!decision.allowed) {
          result = "limited";
          throw new McpGuardError("RATE_LIMITED", decision.retryAfterSeconds);
        }
        acquired = timeCalculation;
        if (controller.signal.aborted || elapsed() >= 5000)
          throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
        const pending = Promise.resolve().then(() => work(controller.signal));
        settledWork = pending.catch(() => undefined);
        const output = await pending;
        if (controller.signal.aborted || elapsed() >= 5000)
          throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
        const parsed = mcpAuditResult.safeParse(output.result);
        if (!parsed.success) throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
        result = parsed.data;
        return output.value;
      } catch (error) {
        if (error instanceof McpGuardError) {
          if (
            error.code === "INVALID_REQUEST" ||
            error.code === "PAYLOAD_TOO_LARGE"
          )
            result = "invalid";
          throw error;
        }
        throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      } finally {
        // Runs only when the real operation settles, including after a timeout.
        await settledWork;
        if (acquired) {
          try {
            await deps.rate.release(userId, requestId);
          } catch {
            result = "unavailable";
            throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
          }
        }
      }
    })();
    try {
      const value = await Promise.race([execution, deadline]);
      await Promise.race([record(), deadline]);
      if (controller.signal.aborted || elapsed() >= 5000)
        throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
      return value;
    } catch (error) {
      // Failed/late work can never publish a result. Timeout audit is attempted
      // without waiting beyond the deadline; failure never becomes fail-open.
      if (!recorded) {
        try {
          const audit = record();
          if (controller.signal.aborted) void audit.catch(() => undefined);
          else await Promise.race([audit, deadline]);
        } catch {
          throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
        }
      }
      if (error instanceof McpGuardError) throw error;
      throw new McpGuardError("TEMPORARILY_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      budget?.signal.removeEventListener("abort", abort);
    }
  };
}
