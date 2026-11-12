// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFortuneModel } from "@/lib/mcpAgent";
import { generateFortuneHtml } from "@/lib/fortuneGeneration";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generate,
}));
const facts = [{ label: "対象日", value: "2026-10-26" }];
beforeEach(() => {
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
  vi.stubEnv("PAID_APIS_DISABLED", "false");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-not-a-secret");
  vi.stubEnv("GEMINI_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.generate.mockReset();
});
it("pins Google and the free-tier-capable model regardless of chat overrides", () => {
  vi.stubEnv("MCP_AGENT_PROVIDER", "xai");
  vi.stubEnv("MCP_AGENT_MODEL", "paid-model");
  const model = createFortuneModel();
  expect(model).toMatchObject({
    provider: "google.generative-ai",
    modelId: "gemini-2.5-flash-lite",
  });
});
it("never calls the SDK with a missing key", async () => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  await expect(generateFortuneHtml(facts)).rejects.toThrow(
    "FORTUNE_AI_UNAVAILABLE",
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it.each(["false", undefined, "", "1", "TRUE"])(
  "never calls Gemini without explicit opt-in (%s)",
  async (flag) => {
    vi.stubEnv("AI_FORTUNE_HTML_ENABLED", flag);
    await expect(generateFortuneHtml(facts)).rejects.toThrow(
      "FORTUNE_AI_UNAVAILABLE",
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  },
);
it.each(["true", undefined])(
  "calls Gemini when opted in even with PAID_APIS_DISABLED=%s",
  async (paidDisabled) => {
    vi.stubEnv("PAID_APIS_DISABLED", paidDisabled);
    mocks.generate.mockImplementation(async (options) => {
      expect(options.model).toMatchObject({
        provider: "google.generative-ai",
        modelId: "gemini-2.5-flash-lite",
      });
      await options.tools.registered_fortune.execute();
      return { text: "<p>{{fact:0}}</p>" };
    });
    expect(await generateFortuneHtml(facts)).toBe("<p>{{fact:0}}</p>");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  },
);
it("forces the in-process tool then decoration, with no retries", async () => {
  mocks.generate.mockImplementation(async (options) => {
    expect(options.maxRetries).toBe(0);
    expect(options.system).toContain("inline CSS");
    expect(options.system).toContain("HTML + CSS only");
    expect(options.system).toContain("No scripts, JavaScript");
    expect(options.system).toContain(
      "CSS animations and transitions are allowed",
    );
    expect(options.system).toContain("never create or change fact text");
    expect(options.prepareStep({ stepNumber: 0 })).toEqual({
      toolChoice: "required",
    });
    expect(options.prepareStep({ stepNumber: 1 })).toEqual({
      toolChoice: "none",
    });
    expect(await options.tools.registered_fortune.execute()).toEqual([
      { ...facts[0], placeholder: "{{fact:0}}" },
    ]);
    return { text: "<p>{{fact:0}}</p>" };
  });
  expect(await generateFortuneHtml(facts)).toBe("<p>{{fact:0}}</p>");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it("rejects output if the tool was skipped", async () => {
  mocks.generate.mockResolvedValue({ text: "<p>{{fact:0}}</p>" });
  await expect(generateFortuneHtml(facts)).rejects.toThrow(
    "FORTUNE_TOOL_REQUIRED",
  );
});
it("aborts a stalled SDK promise at the configured deadline", async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(controller.signal);
  mocks.generate.mockReturnValue(new Promise(() => {}));
  const result = generateFortuneHtml(facts);
  const rejected = expect(result).rejects.toThrow();
  controller.abort();
  await rejected;
  expect(timeout).toHaveBeenCalledWith(12000);
});
it("propagates quota failure once to the cached template fallback", async () => {
  mocks.generate.mockRejectedValue(new Error("429"));
  await expect(generateFortuneHtml(facts)).rejects.toThrow("429");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it("refuses oversized facts before calling the SDK", async () => {
  await expect(
    generateFortuneHtml([{ label: "large", value: "a".repeat(16001) }]),
  ).rejects.toThrow("FORTUNE_INPUT_TOO_LARGE");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("records total usage over all SDK steps", async () => {
  mocks.generate.mockImplementation(async (options) => {
    await options.tools.registered_fortune.execute();
    return {
      text: "<p>{{fact:0}}</p>",
      usage: { inputTokens: 10, outputTokens: 20 },
      totalUsage: { inputTokens: 30, outputTokens: 40 },
    };
  });
  const record = vi.fn();
  await generateFortuneHtml(facts, record);
  expect(record).toHaveBeenCalledWith({ inputTokens: 30, outputTokens: 40 });
});
