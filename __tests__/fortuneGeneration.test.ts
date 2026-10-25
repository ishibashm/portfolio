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
it("never calls the SDK with a missing key, disabled flag or active kill switch", async () => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  await expect(generateFortuneHtml(facts)).rejects.toThrow(
    "FORTUNE_AI_UNAVAILABLE",
  );
  vi.stubEnv("GEMINI_API_KEY", "test-not-a-secret");
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  await expect(generateFortuneHtml(facts)).rejects.toThrow(
    "FORTUNE_AI_UNAVAILABLE",
  );
  vi.stubEnv("PAID_APIS_DISABLED", "false");
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "false");
  await expect(generateFortuneHtml(facts)).rejects.toThrow(
    "FORTUNE_AI_UNAVAILABLE",
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("forces the in-process tool then decoration, with no retries", async () => {
  mocks.generate.mockImplementation(async (options) => {
    expect(options.maxRetries).toBe(0);
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
