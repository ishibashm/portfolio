// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createMcpHttpRejectionAudit } from "@/lib/mcpHttpRejectionAudit";

afterEach(() => vi.useRealTimers());

it.each(["denied", "invalid", "unavailable"] as const)(
  "records only anonymous fixed envelope metadata for %s",
  async (result) => {
    const record = vi.fn().mockResolvedValue(undefined);
    const audit = createMcpHttpRejectionAudit({
      audit: { record },
      monotonicNow: () => 123.9,
    });
    await audit(result, 100);
    expect(record).toHaveBeenCalledExactlyOnceWith({
      userId: null,
      grantId: null,
      event: "invalid_request",
      result,
      durationMs: 23,
    });
  },
);

it.each([NaN, Infinity, -1, 5000, 5001])(
  "does not begin persistence with invalid or exhausted elapsed time %s",
  async (elapsed) => {
    const record = vi.fn();
    const audit = createMcpHttpRejectionAudit({
      audit: { record },
      monotonicNow: () => elapsed,
    });
    await expect(audit("denied", 0)).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
    expect(record).not.toHaveBeenCalled();
  },
);

it("rejects untrusted result strings before writing", async () => {
  const record = vi.fn();
  const audit = createMcpHttpRejectionAudit({
    audit: { record },
    monotonicNow: () => 0,
  });
  await expect(audit("private-token" as "denied", 0)).rejects.toThrow(
    "TEMPORARILY_UNAVAILABLE",
  );
  expect(record).not.toHaveBeenCalled();
});

it("waits only for the original remaining HTTP budget and handles late rejection", async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const record = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  const audit = createMcpHttpRejectionAudit({
    audit: { record },
    monotonicNow: () => 4800,
  });
  const outcome = audit("denied", 0);
  const assertion = expect(outcome).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
  await vi.advanceTimersByTimeAsync(200);
  await assertion;
  reject(new Error("private-token private-birth"));
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

it("redacts synchronous and asynchronous storage errors and rejects late completion", async () => {
  for (const record of [
    vi.fn(() => {
      throw new Error("private-token");
    }),
    vi.fn().mockRejectedValue(new Error("private-birth")),
  ]) {
    const audit = createMcpHttpRejectionAudit({
      audit: { record },
      monotonicNow: () => 0,
    });
    const error = await audit("denied", 0).catch((e: Error) => e);
    expect(error).toMatchObject({ message: "TEMPORARILY_UNAVAILABLE" });
    expect(error).not.toHaveProperty("cause");
  }
  let time = 0;
  const audit = createMcpHttpRejectionAudit({
    audit: {
      record: async () => {
        time = 5000;
      },
    },
    monotonicNow: () => time,
  });
  await expect(audit("denied", 0)).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
});
