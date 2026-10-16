// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import {
  AGENT_LIMITS,
  runAgent,
  createAgentModel,
  type AgentEvent,
} from "@/lib/mcpAgent";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { createAgentMock } from "@/lib/mcpAgentMock";
import { CHAIN_TOOLS, connectChainClient } from "@/lib/mcpChain";
vi.mock("@/lib/prisma", () => {
  throw new Error("DB must not be loaded");
});
vi.mock("@/utils/supabase/server", () => {
  throw new Error("Login must not be loaded");
});
afterEach(() => vi.unstubAllEnvs());
async function run(
  limits = AGENT_LIMITS,
  change?: (c: Awaited<ReturnType<typeof connectChainClient>>) => void,
  model = createAgentMock(),
) {
  const connection = await connectChainClient();
  const events: AgentEvent[] = [];
  const call = vi.spyOn(connection, "call");
  change?.(connection);
  try {
    await runAgent(
      "固定例",
      connection,
      model,
      (e) => events.push(e),
      undefined,
      limits,
    );
  } finally {
    await connection.close();
  }
  return { events, call, model };
}
describe("AIが公開MCPを選ぶループ", () => {
  it("4段の道具選択・前の結果の引継ぎ・回答のストリーミング", async () => {
    const { events, model, call } = await run();
    expect(call.mock.calls.map(([n]) => n)).toEqual([
      "search_municipality",
      "get_honmei_star",
      "judge_directions",
      "find_auspicious_days",
    ]);
    expect(model.doStreamCalls).toHaveLength(5);
    expect(model.doStreamCalls[0].tools?.map((t) => t.name).sort()).toEqual(
      [...CHAIN_TOOLS].sort(),
    );
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(2048);
    const search = events.find(
      (e) => e.type === "tool-result" && e.tool === "search_municipality",
    );
    expect(search).toMatchObject({
      output: {
        results: [expect.objectContaining({ lon: expect.any(Number) })],
      },
    });
    const judged = call.mock.calls[2][1];
    const found = call.mock.calls[3][1];
    expect(found.lon).toBe(judged.lon);
    expect(found.from).toBe(judged.date);
    expect(
      events.some(
        (e) => e.type === "text-delta" && e.text.includes("参考情報"),
      ),
    ).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", calls: 4, reasons: [] });
  });
  it("モデルの例外に含まれる質問・鍵をログにも回答にも出さない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error("1990-05-05 private-question api-key stack");
      },
    });
    const { events } = await run(AGENT_LIMITS, undefined, model);
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toMatch(
      /1990-05-05|private-question|api-key|stack/,
    );
    log.mockRestore();
  });
  it("ステップ上限", async () => {
    const { events, model } = await run({ ...AGENT_LIMITS, steps: 2 });
    expect(model.doStreamCalls).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({
      calls: 2,
      reasons: ["ステップの上限に達しました。"],
    });
  });
  it("呼び出し上限", async () => {
    const { call, events } = await run({ ...AGENT_LIMITS, calls: 1 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events.at(-1))).toContain("回数上限");
  });
  it("1呼び出しの待機時間上限", async () => {
    const { events } = await run({ ...AGENT_LIMITS, callMs: 10 }, (c) => {
      c.call = async () => new Promise(() => {});
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool-result", error: true }),
    );
    expect(JSON.stringify(events.at(-1))).toContain("時間上限");
  });
  it("モデルが応答しなくても全体期限で終える", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => new Promise(() => {}),
    });
    const { events, call } = await run(
      { ...AGENT_LIMITS, totalMs: 20 },
      undefined,
      model,
    );
    expect(call).not.toHaveBeenCalled();
    expect(JSON.stringify(events.at(-1))).toContain("時間上限");
  });
  it("未知の道具と個人用道具を実行しない", async () => {
    for (const toolName of [
      "get_profile",
      "/api/mcp/personal",
      "judge_time_slots",
    ]) {
      const model = new MockLanguageModelV3({
        doStream: async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({
                type: "tool-call",
                toolCallId: "bad",
                toolName,
                input: "{}",
              });
              c.close();
            },
          }),
        }),
      });
      const { call, events } = await run(AGENT_LIMITS, undefined, model);
      expect(call).not.toHaveBeenCalled();
      expect(JSON.stringify(events.at(-1))).toMatch(/拒否|失敗/);
    }
  });
  it("並列の道具要求でも20回を超えない", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(c) {
            for (let i = 0; i < 30; i++)
              c.enqueue({
                type: "tool-call",
                toolCallId: String(i),
                toolName: "get_honmei_star",
                input: '{"birthDate":"1990-05-05"}',
              });
            c.close();
          },
        }),
      }),
    });
    const { events, call } = await run(
      { ...AGENT_LIMITS, calls: 100 },
      undefined,
      model,
    );
    expect(call.mock.calls.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(events.at(-1))).toContain("回数上限");
  });
});
describe("モデル設定", () => {
  it("既定モデルと上書き、キーの別名", async () => {
    expect(chainLlmState({}).model).toBe("gemini-4-argon");
    expect(chainLlmState({ MCP_AGENT_MODEL: "custom" }).model).toBe("custom");
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test");
    expect(await createAgentModel()).toMatchObject({
      modelId: "gemini-4-argon",
    });
  });
  it("productionではモック旗だけでは有効化できない", () => {
    for (const NODE_ENV of ["production", "test", undefined]) {
      expect(
        chainLlmState({
          NODE_ENV,
          MCP_AGENT_ENABLED: "true",
          MCP_AGENT_MOCK: "true",
        }),
      ).toMatchObject({ enabled: false, mock: false });
    }
    expect(
      chainLlmState({
        NODE_ENV: "development",
        MCP_AGENT_ENABLED: "true",
        MCP_AGENT_MOCK: "true",
      }),
    ).toMatchObject({ enabled: true, mock: true });
  });
  it("productionでは鍵があってもモックモデルを作らない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("MCP_AGENT_MOCK", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    expect(await createAgentModel()).not.toBeInstanceOf(MockLanguageModelV3);
  });
});
async function api() {
  vi.resetModules();
  return (await import("@/app/api/mcp-chain/route")).POST;
}
function request(body: unknown, ip = "192.0.2.1") {
  return new Request("https://cloud-palette.com/api/mcp-chain", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      Origin: "https://cloud-palette.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
describe("AI API", () => {
  it("旗・鍵なしなら404", async () => {
    vi.stubEnv("MCP_AGENT_ENABLED", "false");
    let post = await api();
    expect(
      (await post(request({ mode: "llm", question: "質問" }))).status,
    ).toBe(404);
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MCP_AGENT_MOCK", "false");
    post = await api();
    expect(
      (await post(request({ mode: "llm", question: "質問" }))).status,
    ).toBe(404);
  });
  it("長さ・本文バイト数・IPレートを制限", async () => {
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    const post = await api();
    expect(
      (await post(request({ mode: "llm", question: "あ".repeat(501) }))).status,
    ).toBe(400);
    expect((await post(request({ mode: "llm", question: "" }))).status).toBe(
      400,
    );
    expect((await post(request({ mode: "llm", question: "" }))).status).toBe(
      429,
    );
    expect(
      (
        await post(
          request({ mode: "llm", question: "あ".repeat(2000) }, "192.0.2.2"),
        )
      ).status,
    ).toBe(413);
  });
  it("IPを変えても全体レートを制限", async () => {
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    const post = await api();
    for (let i = 0; i < 6; i++)
      expect(
        (await post(request({ mode: "llm", question: "" }, `192.0.2.${i}`)))
          .status,
      ).toBe(400);
    expect(
      (await post(request({ mode: "llm", question: "" }, "192.0.2.100")))
        .status,
    ).toBe(429);
  });
  it("開発モックのAPIは実MCP経由でNDJSONを完了する。同時実行は1件", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("MCP_AGENT_MOCK", "true");
    const post = await api();
    const response = await post(request({ mode: "llm", question: "例" }));
    expect(
      (await post(request({ mode: "llm", question: "例" }, "192.0.2.2")))
        .status,
    ).toBe(429);
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: "done",
      calls: 4,
      reasons: [],
    });
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
  });
});
