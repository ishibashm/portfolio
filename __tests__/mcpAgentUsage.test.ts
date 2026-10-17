// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { runAgent } from "@/lib/mcpAgent";
import { connectChainClient } from "@/lib/mcpChain";
it("SDKから取得したusageと実モデル名を精算先へ渡す", async () => {
  const model = new MockLanguageModelV3({
    modelId: "metered",
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "answer" });
          controller.enqueue({
            type: "text-delta",
            id: "answer",
            delta: "九星気学は参考情報です。",
          });
          controller.enqueue({ type: "text-end", id: "answer" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 100,
                noCache: 100,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 200, text: 200, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
  const onUsage = vi.fn();
  const connection = await connectChainClient();
  try {
    await runAgent(
      "説明して",
      connection,
      model,
      () => {},
      undefined,
      undefined,
      { onUsage },
    );
  } finally {
    await connection.close();
  }
  expect(onUsage).toHaveBeenCalledExactlyOnceWith("metered", 100, 200);
});

it("一部ステップのusageが欠落した合算を確定額として扱わない", async () => {
  let step = 0;
  const model = new MockLanguageModelV3({
    modelId: "partial",
    doStream: async () => {
      const first = step++ === 0;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            if (first)
              controller.enqueue({
                type: "tool-call",
                toolCallId: "birth",
                toolName: "get_honmei_star",
                input: '{"birthYear":1990}',
              });
            else {
              controller.enqueue({ type: "text-start", id: "answer" });
              controller.enqueue({
                type: "text-delta",
                id: "answer",
                delta: "道具の結果を確認してください。",
              });
              controller.enqueue({ type: "text-end", id: "answer" });
            }
            controller.enqueue({
              type: "finish",
              finishReason: {
                unified: first ? "tool-calls" : "stop",
                raw: undefined,
              },
              usage: {
                inputTokens: {
                  total: first ? undefined : 100,
                  noCache: undefined,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 20, text: 20, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      };
    },
  });
  const onUsage = vi.fn();
  const connection = await connectChainClient();
  try {
    await runAgent(
      "1990年生まれの本命星",
      connection,
      model,
      () => {},
      undefined,
      undefined,
      { onUsage },
    );
  } finally {
    await connection.close();
  }
  expect(step).toBe(2);
  expect(onUsage).toHaveBeenCalledExactlyOnceWith("partial", undefined, 40);
});
