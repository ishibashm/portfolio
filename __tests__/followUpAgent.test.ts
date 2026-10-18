// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { AGENT_SYSTEM, runAgent, type AgentEvent } from "@/lib/mcpAgent";
import { formatFollowUpEnvelope } from "@/lib/followUpSuggestions";

it.each(["question", "history", "people", "output", "answer"])(
  "doneの候補は%sの地名を根拠にし、無関係な地名を捨てる",
  async (source) => {
    const place = "名古屋市中村区";
    const output: Record<string, unknown> = {
      get_honmei_star: { birthDate: "1990-04-15", honmeiStar: 3 },
      judge_directions: {
        directions: [],
        ...(source === "output" ? { municipality: place } : {}),
      },
      find_auspicious_days: { directions: [] },
    };
    const connection = {
      call: vi.fn(async (name: string) => output[name]),
      close: async () => {},
      listTools: async () => ({
        tools: Object.keys(output).map((name) => ({
          name,
          inputSchema: { type: "object" as const },
        })),
      }),
    };
    const suggestions = [
      "出発地を東京都新宿区に指定する",
      "南西の街を3つ教えて",
      `${place}の吉日を詳しく`,
    ];
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta:
                (source === "answer"
                  ? `${place}の結果です。`
                  : "結果をご覧ください。") +
                formatFollowUpEnvelope(suggestions),
            });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      }),
    });
    const events: AgentEvent[] = [];
    await runAgent(
      `引越しの日付と方位を相談したいです。${source === "question" ? place : ""}`,
      connection,
      model,
      (event) => events.push(event),
      undefined,
      undefined,
      {},
      {
        people: [
          {
            id: "example",
            name: "見本",
            birthDate: "1990-04-15",
            origin: {
              lat: 35.1709,
              lon: 136.8815,
              ...(source === "people" ? { name: place } : {}),
            },
          },
        ],
        ...(source === "history"
          ? { history: [{ role: "user" as const, content: place }] }
          : {}),
      },
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      suggestions: suggestions.slice(1),
    });
    if (source === "output")
      expect(
        connection.call.mock.calls.some(
          ([name]) => name === "judge_directions",
        ),
      ).toBe(true);
  },
);
it("生年月日と出発地の不足は本文の質問リストではなくボタンに案内する", () => {
  expect(AGENT_SYSTEM).toContain(
    "足りない項目（生年月日・生まれ年・出発地など）",
  );
  expect(AGENT_SYSTEM).toContain("本文で番号付きの質問リストを並べず");
});
