import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMcpPrivacyGuard,
  McpGuardError,
  readMcpPersonalBody,
} from "@/lib/mcpPrivacyGuard";
import type { McpAuthContext } from "@/lib/mcpAuth";

const context: McpAuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "22222222-2222-4222-8222-222222222222",
  clientId: "private-client",
  allowedProfileIds: ["private-profile"],
};
function setup() {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const usage = { markUsed: vi.fn().mockResolvedValue(undefined) };
  const rate = {
    reserve: vi.fn().mockResolvedValue({ allowed: true }),
    release: vi.fn().mockResolvedValue(undefined),
  };
  let time = 0;
  return {
    audit,
    usage,
    rate,
    run: createMcpPrivacyGuard({
      audit,
      rate,
      usage,
      monotonicNow: () => time,
    }),
    advance: (ms: number) => {
      time += ms;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MCP privacy execution guard (unmounted)", () => {
  it("returns only after audit and release, passing no private arguments/results to stores", async () => {
    const { run, audit, rate, advance } = setup();
    const value = {
      birthDate: "private-birth",
      lat: 35,
      token: "private-token",
    };
    expect(
      await run(context, "judge_time_slots", async () => {
        advance(12);
        return { value, result: "success" };
      }),
    ).toBe(value);
    expect(audit.record).toHaveBeenCalledWith({
      userId: context.userId,
      grantId: context.grantId,
      event: "judge_time_slots",
      result: "success",
      durationMs: 12,
    });
    expect(rate.reserve).toHaveBeenCalledWith({
      userId: context.userId,
      requestId: expect.any(String),
      timeCalculation: true,
    });
    expect(rate.release).toHaveBeenCalledWith(
      context.userId,
      rate.reserve.mock.calls[0][0].requestId,
    );
    expect(rate.release.mock.invocationCallOrder[0]).toBeLessThan(
      audit.record.mock.invocationCallOrder[0],
    );
    expect(
      JSON.stringify([
        audit.record.mock.calls,
        rate.reserve.mock.calls,
        rate.release.mock.calls,
      ]),
    ).not.toContain("private-");
  });

  it("rejects invalid internal identity/event before work or stores", async () => {
    const { run, audit, rate } = setup();
    const work = vi.fn();
    await expect(
      run({ ...context, userId: "dev-bypass-id" }, "get_profile", work),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      run(context, "get_profile\nforged" as "get_profile", work),
    ).rejects.toMatchObject({ status: 400 });
    expect(work).not.toHaveBeenCalled();
    expect(rate.reserve).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("returns 429 and Retry-After metadata without executing or releasing another request", async () => {
    const { run, audit, rate } = setup();
    rate.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const work = vi.fn();
    await expect(run(context, "judge_time_slots", work)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 3,
    });
    expect(work).not.toHaveBeenCalled();
    expect(rate.release).not.toHaveBeenCalled();
    expect(audit.record.mock.calls[0][0].result).toBe("limited");
  });

  it.each(["reserve", "work", "release", "usage", "audit"])(
    "fails closed without logging raw %s errors",
    async (failure) => {
      const { run, audit, rate, usage } = setup();
      const raw = new Error("private-birth private-token\nforged-log");
      if (failure === "reserve") rate.reserve.mockRejectedValue(raw);
      if (failure === "release") rate.release.mockRejectedValue(raw);
      if (failure === "audit") audit.record.mockRejectedValue(raw);
      if (failure === "usage") usage.markUsed.mockRejectedValue(raw);
      const spies = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "error"),
      ];
      const error = await run(context, "judge_time_slots", async () => {
        if (failure === "work") throw raw;
        return { value: "private-result", result: "success" };
      }).catch((e: Error) => e);
      expect(error).toMatchObject({
        message: "TEMPORARILY_UNAVAILABLE",
        status: 503,
      });
      expect(error).not.toHaveProperty("cause");
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain("private-");
      if (failure === "usage")
        expect(audit.record.mock.calls[0][0].result).toBe("unavailable");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    },
  );

  it("marks only successful use before audit with original remaining budget and immutable identity", async () => {
    const s = setup();
    const mutable = { ...context };
    const value = await s.run(mutable, "get_profile", async () => {
      mutable.userId = "33333333-3333-4333-8333-333333333333";
      s.advance(4200);
      return { value: "private-result", result: "success" };
    });
    expect(value).toBe("private-result");
    expect(s.usage.markUsed).toHaveBeenCalledExactlyOnceWith(
      context.userId,
      context.grantId,
      {
        signal: expect.any(AbortSignal),
        remainingMs: expect.any(Function),
      },
    );
    expect(s.usage.markUsed.mock.calls[0][2].remainingMs()).toBe(800);
    expect(s.usage.markUsed.mock.invocationCallOrder[0]).toBeLessThan(
      s.audit.record.mock.invocationCallOrder[0],
    );
    for (const result of [
      "denied",
      "invalid",
      "limited",
      "unavailable",
      "revoked",
    ] as const)
      await s.run(context, "get_profile", async () => ({
        value: null,
        result,
      }));
    expect(s.usage.markUsed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s.usage.markUsed.mock.calls)).not.toContain(
      "private-",
    );
  });

  it("bounds slow usage writes, propagates cancellation and never publishes late success", async () => {
    vi.useFakeTimers();
    const s = setup();
    const pending = deferred<void>();
    s.usage.markUsed.mockReturnValue(pending.promise);
    s.advance(4500);
    const parent = new AbortController();
    const outcome = s
      .run(
        context,
        "get_profile",
        async () => ({ value: "private-result", result: "success" }),
        { startedAt: 0, signal: parent.signal },
      )
      .catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect(await outcome).toMatchObject({ status: 503 });
    expect(s.usage.markUsed.mock.calls[0][2].signal.aborted).toBe(true);
    expect(s.audit.record.mock.calls[0][0].result).toBe("unavailable");
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.audit.record).toHaveBeenCalledTimes(1);
    expect(s.usage.markUsed).toHaveBeenCalledTimes(1);
  });

  it("records tool denial explicitly and keeps parallel users' identities separate", async () => {
    const { run, audit, rate } = setup();
    const other = {
      ...context,
      userId: "33333333-3333-4333-8333-333333333333",
      grantId: "44444444-4444-4444-8444-444444444444",
    };
    const pending = deferred<{ value: string; result: "denied" }>();
    const first = run(context, "get_profile", () => pending.promise);
    await run(other, "get_profile", async () => ({
      value: "second",
      result: "success",
    }));
    pending.resolve({ value: "first", result: "denied" });
    expect(await first).toBe("first");
    expect(
      audit.record.mock.calls.map(([data]) => [
        data.userId,
        data.grantId,
        data.result,
      ]),
    ).toEqual([
      [other.userId, other.grantId, "success"],
      [context.userId, context.grantId, "denied"],
    ]);
    expect(rate.release).not.toHaveBeenCalled();
  });

  it("times out slow work, aborts its signal and retains its lease until real completion", async () => {
    vi.useFakeTimers();
    const { run, audit, rate } = setup();
    const pending = deferred<{ value: string; result: "success" }>();
    let signal: AbortSignal | undefined;
    const outcome = run(context, "judge_time_slots", (s) => {
      signal = s;
      return pending.promise;
    }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await outcome).toMatchObject({ code: "TEMPORARILY_UNAVAILABLE" });
    expect(signal?.aborted).toBe(true);
    expect(rate.release).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0].result).toBe("unavailable");
    pending.resolve({ value: "private-late-result", result: "success" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rate.release).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("cleans up late reservations without starting work and bounds slow audit", async () => {
    vi.useFakeTimers();
    const { run, audit, rate } = setup();
    const pending = deferred<{ allowed: true }>();
    rate.reserve.mockReturnValue(pending.promise);
    const work = vi.fn();
    const outcome = run(context, "judge_time_slots", work).catch(
      (e: Error) => e,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(await outcome).toBeInstanceOf(McpGuardError);
    pending.resolve({ allowed: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(work).not.toHaveBeenCalled();
    expect(rate.release).toHaveBeenCalledTimes(1);
    rate.reserve.mockResolvedValue({ allowed: true });
    audit.record.mockReturnValue(new Promise(() => {}));
    const second = run(context, "get_profile", async () => ({
      value: "private-result",
      result: "success",
    })).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await second).toMatchObject({ status: 503 });
  });

  it("shares the HTTP start time and only allows the remaining budget", async () => {
    vi.useFakeTimers();
    const { run, advance, audit } = setup();
    advance(4200); // Authentication and body reading already used this time.
    const parent = new AbortController();
    const outcome = run(context, "get_profile", () => new Promise(() => {}), {
      startedAt: 0,
      signal: parent.signal,
    }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(799);
    expect(audit.record).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatchObject({ status: 503 });
    expect(audit.record.mock.calls[0][0].durationMs).toBe(4200);
  });

  it("rejects exhausted, future, invalid and aborted budgets before reservation", async () => {
    const { run, rate, advance } = setup();
    const controller = new AbortController();
    const work = vi.fn();
    advance(5000);
    for (const startedAt of [0, -1, 5001, NaN, Infinity])
      await expect(
        run(context, "get_profile", work, {
          startedAt,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ status: 503 });
    controller.abort();
    await expect(
      run(context, "get_profile", work, {
        startedAt: 5000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(rate.reserve).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("propagates HTTP cancellation without freeing unfinished work's lease", async () => {
    const { run, rate } = setup();
    const parent = new AbortController();
    const pending = deferred<{ value: string; result: "success" }>();
    const begun = deferred<AbortSignal>();
    const outcome = run(
      context,
      "judge_time_slots",
      (signal) => {
        begun.resolve(signal);
        return pending.promise;
      },
      { startedAt: 0, signal: parent.signal },
    ).catch((e: Error) => e);
    const signal = await begun.promise;
    parent.abort();
    expect(await outcome).toMatchObject({ status: 503 });
    expect(signal.aborted).toBe(true);
    expect(rate.release).not.toHaveBeenCalled();
    pending.resolve({ value: "private-late", result: "success" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rate.release).toHaveBeenCalledTimes(1);
  });

  it("rejects synchronous work exceeding the deadline even before the timer can fire", async () => {
    const { run, advance } = setup();
    await expect(
      run(context, "get_profile", async () => {
        advance(5000);
        return { value: "private-result", result: "success" };
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

// No actual HTTP listener or external connections.
function bodyRequest(bytes: Uint8Array[], headers?: HeadersInit) {
  return new Request("https://example.test/api/mcp/personal", {
    method: "POST",
    headers,
    body: new ReadableStream({
      start(controller) {
        for (const b of bytes) controller.enqueue(b);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}
describe("bounded personal request body", () => {
  it("accepts exactly 32KiB and rejects chunked or multibyte overflow regardless of a false content length", async () => {
    const signal = new AbortController().signal;
    expect(
      (
        await readMcpPersonalBody(
          bodyRequest([new Uint8Array(32768).fill(65)]),
          signal,
        )
      ).length,
    ).toBe(32768);
    for (const request of [
      bodyRequest([new Uint8Array(32768), new Uint8Array(1)]),
      bodyRequest([new TextEncoder().encode("あ".repeat(11000))], {
        "content-length": "1",
      }),
      bodyRequest([], { "content-length": "32769" }),
    ])
      await expect(readMcpPersonalBody(request, signal)).rejects.toMatchObject({
        status: 413,
      });
  });

  it("rejects bad encoding, length, UTF8, missing body and stream errors without exposing data", async () => {
    const signal = new AbortController().signal;
    for (const request of [
      bodyRequest([], { "content-encoding": "gzip" }),
      bodyRequest([], { "content-length": "invalid" }),
      bodyRequest([new Uint8Array([0xff])]),
      new Request("https://example.test", { method: "POST" }),
      new Request("https://example.test", {
        method: "POST",
        body: new ReadableStream({
          start(c) {
            c.error(new Error("private-token"));
          },
        }),
        duplex: "half",
      } as RequestInit),
    ])
      await expect(readMcpPersonalBody(request, signal)).rejects.toMatchObject({
        message: "INVALID_REQUEST",
        status: 400,
      });
  });

  it("cancels a stalled stream when the execution deadline aborts", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const request = new Request("https://example.test", {
      method: "POST",
      body: new ReadableStream({ cancel }),
      duplex: "half",
    } as RequestInit);
    const outcome = readMcpPersonalBody(request, controller.signal).catch(
      (e: Error) => e,
    );
    controller.abort();
    expect(await outcome).toMatchObject({ status: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
