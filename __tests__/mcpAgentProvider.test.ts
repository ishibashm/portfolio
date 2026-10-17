// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createXai } from "@ai-sdk/xai";
import { APICallError } from "@ai-sdk/provider";
import { chainLlmState, DEFAULT_AGENT_MODEL } from "@/lib/mcpAgentConfig";
import {
  createAgentModel,
  runAgent,
  classifyModelError,
  AGENT_PAUSED_REASON,
  type AgentEvent,
} from "@/lib/mcpAgent";
import { connectChainClient } from "@/lib/mcpChain";
afterEach(() => vi.unstubAllEnvs());
it("既定Googleを維持し、xAIはモデルと対応する鍵の明示が必要", () => {
  expect(
    chainLlmState({ MCP_AGENT_ENABLED: "true", GEMINI_API_KEY: "test" }),
  ).toMatchObject({
    provider: "google",
    model: DEFAULT_AGENT_MODEL,
    enabled: true,
  });
  expect(
    chainLlmState({
      MCP_AGENT_ENABLED: "true",
      MCP_AGENT_PROVIDER: "xai",
      GEMINI_API_KEY: "test",
    }).enabled,
  ).toBe(false);
  expect(
    chainLlmState({
      MCP_AGENT_ENABLED: "true",
      MCP_AGENT_PROVIDER: "xai",
      XAI_API_KEY: "test",
    }).enabled,
  ).toBe(false);
  expect(
    chainLlmState({
      MCP_AGENT_ENABLED: "true",
      MCP_AGENT_PROVIDER: "xai",
      XAI_API_KEY: "test",
      XAI_AGENT_MODEL: "chosen-model",
      MCP_AGENT_FALLBACK_MODEL: "google-only",
    }),
  ).toMatchObject({
    enabled: true,
    provider: "xai",
    model: "chosen-model",
    fallbackModel: "",
  });
  expect(
    chainLlmState({
      MCP_AGENT_ENABLED: "true",
      MCP_AGENT_PROVIDER: "unknown",
      GEMINI_API_KEY: "test",
    }).enabled,
  ).toBe(false);
});
it("factoryは選択したプロバイダーを使用する（ネットワーク通信なし）", async () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_PROVIDER", "xai");
  vi.stubEnv("XAI_API_KEY", "test");
  vi.stubEnv("XAI_AGENT_MODEL", "chosen-model");
  const model = await createAgentModel();
  expect(typeof model).toBe("object");
  if (typeof model !== "string") {
    expect(model.provider).toMatch(/^xai/);
    expect(model.modelId).toBe("chosen-model");
  }
});
it("xAI SDKの402は1回で停止し、再試行・切替・追加要約しない", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: { message: "Your prepayment credits are depleted." },
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
  );
  const model = createXai({ apiKey: "test", fetch })("chosen-model");
  const fallback = vi.fn();
  const events: AgentEvent[] = [];
  const connection = await connectChainClient();
  try {
    await runAgent(
      "考え方を教えて",
      connection,
      model,
      (event) => events.push(event),
      undefined,
      undefined,
      { fallback },
    );
  } finally {
    await connection.close();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fallback).not.toHaveBeenCalled();
  expect(events.at(-1)).toMatchObject({
    type: "done",
    calls: 0,
    reasons: [AGENT_PAUSED_REASON],
  });
});
it("xAIのSDKエラーも402と一時429を区別する", () => {
  for (const [statusCode, expected] of [
    [402, "billing"],
    [429, "transient"],
  ] as const) {
    expect(
      classifyModelError(
        new APICallError({
          message: "request failed",
          url: "https://api.x.ai/v1/responses",
          requestBodyValues: {},
          statusCode,
          responseBody: "{}",
        }),
      ),
    ).toBe(expected);
  }
});
