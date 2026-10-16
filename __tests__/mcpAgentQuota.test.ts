// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import {
  AGENT_LIMITS,
  AGENT_SYSTEM,
  classifyModelError,
  runAgent,
  type AgentEvent,
} from "@/lib/mcpAgent";

it.each([
  [
    {
      statusCode: 429,
      message: "Quota exceeded free_tier_requests Please retry in 10h23m",
    },
    "daily-quota",
  ],
  [
    {
      statusCode: 429,
      responseBody:
        "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    },
    "daily-quota",
  ],
  [
    { cause: { statusCode: 429, responseBody: '{"retryDelay":"3600s"}' } },
    "daily-quota",
  ],
  [
    { statusCode: 429, responseHeaders: { "retry-after": "120" } },
    "daily-quota",
  ],
  [{ statusCode: 429, message: "retry in 59.5s" }, "transient"],
  [
    { statusCode: 429, message: "free_tier_requests retry in 500ms" },
    "transient",
  ],
  [{ statusCode: 503, message: "overloaded" }, "transient"],
  [{ statusCode: 400, message: "invalid input" }, "permanent"],
])("classifies %j as %s", (error, reason) =>
  expect(classifyModelError(error)).toBe(reason),
);

function stream(calls: { id: string; tool: string; input: unknown }[] = []) {
  const parts: LanguageModelV3StreamPart[] = [
    { type: "stream-start", warnings: [] },
    ...calls.map((c) => ({
      type: "tool-call" as const,
      toolCallId: c.id,
      toolName: c.tool,
      input: JSON.stringify(c.input),
    })),
    {
      type: "finish",
      finishReason: {
        unified: calls.length ? "tool-calls" : "stop",
        raw: undefined,
      },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    },
  ];
  return {
    stream: new ReadableStream<LanguageModelV3StreamPart>({
      start(c) {
        parts.forEach((p) => c.enqueue(p));
        c.close();
      },
    }),
  };
}
const article = {
  articles: [{ slug: "moving", title: "引越し", description: "参考情報" }],
};
const connection = (call = vi.fn(async () => article)) => ({
  call,
  close: async () => {},
  listTools: async () => ({
    tools: [
      {
        name: "search_articles",
        inputSchema: { type: "object" as const, additionalProperties: true },
      },
    ],
  }),
});

it.each(["success", "daily", "permanent"])(
  "daily quota immediately falls back (%s), retaining and deduplicating blocks",
  async (outcome) => {
    let step = 0;
    const primary = new MockLanguageModelV3({
      doStream: async () => {
        if (step++ === 0)
          return stream([
            {
              id: "source",
              tool: "search_articles",
              input: { query: "引越し" },
            },
          ]);
        if (step === 2)
          return stream([
            {
              id: "show",
              tool: "show_blocks",
              input: {
                blocks: [{ type: "articles", ids: ["source", "source"] }],
              },
            },
          ]);
        throw Object.assign(
          new Error("Quota exceeded free_tier_requests Please retry in 10h"),
          { statusCode: 429 },
        );
      },
    });
    const fallbackModel = new MockLanguageModelV3({
      doStream: async () => {
        if (outcome === "success") return stream();
        throw Object.assign(
          new Error(outcome === "daily" ? "daily quota" : "invalid"),
          { statusCode: outcome === "daily" ? 429 : 400 },
        );
      },
    });
    const fallback = vi.fn(async () => fallbackModel);
    const events: AgentEvent[] = [];
    await runAgent(
      "引越し",
      connection(),
      primary,
      (e) => events.push(e),
      undefined,
      AGENT_LIMITS,
      { fallback },
    );
    expect(primary.doStreamCalls).toHaveLength(3);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallbackModel.doStreamCalls).toHaveLength(1);
    expect(
      events
        .filter((e) => e.type === "blocks")
        .flatMap((e) => (e.type === "blocks" ? e.blocks : [])),
    ).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      reasons:
        outcome === "success"
          ? []
          : [
              "本日のAI回答の枠が終わりました。道具で計算した結果だけを表示しています。",
            ],
    });
  },
);

it("independent tool calls start together and finish in one step", async () => {
  expect(AGENT_LIMITS.steps).toBe(5);
  expect(AGENT_SYSTEM).toContain("同じステップで並列");
  let release!: () => void;
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  const call = vi.fn(async () => {
    if (++started === 2) release();
    await bothStarted;
    return article;
  });
  let step = 0;
  const model = new MockLanguageModelV3({
    doStream: async () =>
      step++ === 0
        ? stream([
            { id: "a", tool: "search_articles", input: { query: "方位" } },
            { id: "b", tool: "search_articles", input: { query: "家賃" } },
          ])
        : stream(),
  });
  const events: AgentEvent[] = [];
  await runAgent(
    "方位と家賃",
    connection(call),
    model,
    (e) => events.push(e),
    undefined,
    { ...AGENT_LIMITS, callMs: 1000 },
  );
  expect(call).toHaveBeenCalledTimes(2);
  expect(model.doStreamCalls).toHaveLength(2);
  expect(events.at(-1)).toMatchObject({ reasons: [] });
  expect(events.filter((e) => e.type === "blocks")).toHaveLength(1);
});

it("daily quota without a configured fallback retains unselected tool results", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => {
      if (step++ === 0)
        return stream([
          { id: "source", tool: "search_articles", input: { query: "引越し" } },
        ]);
      throw Object.assign(new Error("daily quota"), { statusCode: 429 });
    },
  });
  const events: AgentEvent[] = [];
  await runAgent("引越し", connection(), model, (e) => events.push(e));
  expect(model.doStreamCalls).toHaveLength(2);
  expect(events.filter((e) => e.type === "blocks")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({
    reasons: [
      "本日のAI回答の枠が終わりました。道具で計算した結果だけを表示しています。",
    ],
  });
});
