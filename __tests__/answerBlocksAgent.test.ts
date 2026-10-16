// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { runAgent, type AgentEvent } from "@/lib/mcpAgent";
import { assertChainTool } from "@/lib/mcpChain";

it.each(["source", "unknown"])(
  "agent-only show_blocks resolves %s against completed calls",
  async (id) => {
    const call = vi.fn(async () => ({
      articles: [{ slug: "moving", title: "引越し", description: "参考情報" }],
    }));
    const connection = {
      call,
      close: async () => {},
      listTools: async () => ({
        tools: [
          {
            name: "search_articles",
            inputSchema: {
              type: "object" as const,
              additionalProperties: true,
            },
          },
        ],
      }),
    };
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        const parts: LanguageModelV3StreamPart[] = [
          { type: "stream-start", warnings: [] },
        ];
        if (current < 2)
          parts.push({
            type: "tool-call",
            toolCallId: current === 0 ? "source" : "show",
            toolName: current === 0 ? "search_articles" : "show_blocks",
            input: JSON.stringify(
              current === 0
                ? { query: "引越し" }
                : { blocks: [{ type: "articles", ids: [id] }] },
            ),
          });
        parts.push({
          type: "finish",
          finishReason: {
            unified: current < 2 ? "tool-calls" : "stop",
            raw: undefined,
          },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        });
        return {
          stream: new ReadableStream({
            start(c) {
              for (const p of parts) c.enqueue(p);
              c.close();
            },
          }),
        };
      },
    });
    const events: AgentEvent[] = [];
    await runAgent("引越しの記事", connection, model, (e) => events.push(e));
    expect(call).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === "blocks")).toHaveLength(1);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", calls: 2 });
    if (done?.type === "done")
      expect(done.reasons.length).toBe(id === "source" ? 0 : 1);
    expect(() => assertChainTool("show_blocks")).toThrow();
  },
);
