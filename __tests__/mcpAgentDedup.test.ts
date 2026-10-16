// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { AGENT_LIMITS, runAgent, type AgentEvent } from "@/lib/mcpAgent";
import { toolCallKey } from "@/lib/mcpToolCallKey";

it("キーを再帰的に正規化し、配列順・道具名・異なる入力を区別する", () => {
  const a = { z: [{ b: 2, a: 1 }], a: null };
  expect(toolCallKey("a", a)).toBe(
    toolCallKey("a", { a: null, z: [{ a: 1, b: 2 }] }),
  );
  expect(toolCallKey("a", a)).not.toBe(toolCallKey("b", a));
  expect(toolCallKey("a", { a: [1, 2] })).not.toBe(
    toolCallKey("a", { a: [2, 1] }),
  );
});

it("並列・次ステップの重複を上限到達後も再利用し、別の実行では再計算する", async () => {
  const call = vi.fn(async () => ({ result: "共有結果" }));
  const connection = {
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
  };
  for (let run = 0; run < 2; run++) {
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async ({ prompt }) => {
        const current = step++;
        if (current > 0) expect(JSON.stringify(prompt)).toContain("共有結果");
        return {
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "stream-start", warnings: [] });
              if (current < 2) {
                for (let i = 0; i < (current === 0 ? 2 : 1); i++)
                  c.enqueue({
                    type: "tool-call",
                    toolCallId: `${current}-${i}`,
                    toolName: "search_articles",
                    input:
                      i === 0
                        ? '{"query":"方位","nested":{"b":2,"a":1}}'
                        : '{"nested":{"a":1,"b":2},"query":"方位"}',
                  });
              }
              c.enqueue({
                type: "finish",
                finishReason: {
                  unified: current < 2 ? "tool-calls" : "stop",
                  raw: undefined,
                },
                usage: {
                  inputTokens: {
                    total: 0,
                    noCache: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 0, text: 0, reasoning: 0 },
                },
              });
              c.close();
            },
          }),
        };
      },
    });
    const events: AgentEvent[] = [];
    await runAgent(
      "方位",
      connection,
      model,
      (e) => events.push(e),
      undefined,
      { ...AGENT_LIMITS, calls: 1 },
    );
    expect(step).toBe(4);
    expect(events.filter((e) => e.type === "tool-call")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "done", calls: 1 });
    expect(call).toHaveBeenCalledTimes(run + 1);
  }
});
