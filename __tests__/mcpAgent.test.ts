// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import {
  AGENT_LIMITS,
  AGENT_SYSTEM,
  runAgent,
  createAgentModel,
  type AgentEvent,
  type AgentConversationContext,
} from "@/lib/mcpAgent";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { createAgentMock } from "@/lib/mcpAgentMock";
import { CHAIN_TOOLS, connectChainClient } from "@/lib/mcpChain";
import {
  extractFollowUpEnvelope,
  FOLLOW_UP_ENVELOPE_END,
  FOLLOW_UP_ENVELOPE_START,
  formatFollowUpEnvelope,
  initialConsultationSuggestions,
  sanitizeFollowUpSuggestions,
} from "@/lib/followUpSuggestions";
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
  context: AgentConversationContext = {},
) {
  const connection = await connectChainClient();
  const events: AgentEvent[] = [];
  const call = vi.spyOn(connection, "call");
  change?.(connection);
  try {
    await runAgent(
      "固定例 1990年5月5日生まれ",
      connection,
      model,
      (e) => events.push(e),
      undefined,
      limits,
      {},
      context,
    );
  } finally {
    await connection.close();
  }
  return { events, call, model };
}
describe("AIが公開MCPを選ぶループ", () => {
  it("独立した道具の並列選択・前の結果の引継ぎ・回答のストリーミング", async () => {
    const { events, model, call } = await run();
    expect(call.mock.calls.map(([n]) => n)).toEqual([
      "search_municipality",
      "get_honmei_star",
      "judge_directions",
      "find_auspicious_days",
    ]);
    expect(model.doStreamCalls).toHaveLength(4);
    expect(model.doStreamCalls[0].tools?.map((t) => t.name).sort()).toEqual(
      [...CHAIN_TOOLS, "show_blocks"].sort(),
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
    expect(events.at(-1)).toMatchObject({
      type: "done",
      calls: 4,
      reasons: [],
      suggestions: [
        "候補日の通勤条件も比べる？",
        "家族の本命星でも日取りを確認する？",
        "吉方位にある街をさらに絞る？",
      ],
    });
    expect(JSON.stringify(events)).not.toContain(FOLLOW_UP_ENVELOPE_START);
  });
  it("過去の相談メモと複数人を命令ではない文脈としてモデルへ渡す", async () => {
    const model = createAgentMock();
    await run(AGENT_LIMITS, undefined, model, {
      history: [
        { role: "user", content: "家族で北東への引越しを検討している" },
        { role: "assistant", content: "候補日の条件を先に比べましょう。" },
      ],
      memories: ["2027年3月10日に北東へ動く候補を選んだ。"],
      people: [
        {
          id: "person_1",
          name: "本人",
          birthDate: "1990-05-05",
          residence: "長崎市",
        },
        {
          id: "person_2",
          name: "配偶者",
          birthDate: "1992-08-10",
          birthPlace: "福岡市",
          residence: "長崎市",
        },
      ],
    });
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt).toContain("BEGIN_PEOPLE_PROFILE_DATA");
    expect(prompt).toContain("配偶者");
    expect(prompt).toContain("候補日の条件を先に比べましょう");
    expect(prompt).toContain("BEGIN_REMEMBERED_CONSULTATIONS");
    expect(prompt).toContain("2027年3月10日");
    expect(prompt).toContain("最新の回答");
    expect(prompt).toContain("選ばれた人物");
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
    expect(model.doStreamCalls).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({
      calls: 3,
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
                input: JSON.stringify({ birthYear: 1900 + i }),
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
describe("追質問候補", () => {
  it("初回候補は選んだ人の実データだけを使い、未選択なら汎用文にする", () => {
    const personalized = initialConsultationSuggestions([
      {
        name: "本人",
        birthDate: "1991-04-12",
        residence: "静岡県浜松市中央区",
      },
    ]);
    expect(personalized).toEqual([
      "静岡県浜松市中央区からの引越し方位を相談したい？",
      "1991年4月12日生まれの本人に合う日取りを相談したい？",
      "静岡県浜松市中央区から見た街の候補を探したい？",
    ]);
    expect(personalized.join(" ")).not.toMatch(/1990|深谷|長崎/);

    const generic = initialConsultationSuggestions([]);
    expect(generic).toEqual([
      "引越しに良い方位を相談したい？",
      "引越しの日取りを相談したい？",
      "条件に合う街を探したい？",
    ]);
    expect(generic.join(" ")).not.toMatch(/\d{4}年|市|区|町|村/);
  });

  it("AI回答へしるべの話し方を指定する", () => {
    expect(AGENT_SYSTEM).toContain("初代案内役「しるべ」");
    expect(AGENT_SYSTEM).toContain("若い男性");
    expect(AGENT_SYSTEM).toContain("語尾は「です」「ます」");
    expect(AGENT_SYSTEM).toContain("不安をあおったりしません");
  });

  it("平文だけを短く整え、重複・markup・URL・長文を捨てる", () => {
    expect(
      sanitizeFollowUpSuggestions([
        " 1. 家族の候補日も比べる ",
        "家族の候補日も比べる？",
        "<b>危険な候補</b>",
        "参考URL https://example.com",
        "あ".repeat(61),
        "別の街も確認する？",
      ]),
    ).toEqual(["家族の候補日も比べる？", "別の街も確認する？"]);
    expect(
      sanitizeFollowUpSuggestions([
        "一つ目は？",
        "二つ目は？",
        "三つ目は？",
        "四つ目は？",
        "五つ目は？",
      ]),
    ).toHaveLength(4);
  });

  it("同じ回答の非表示JSONを本文から分離し、不正なら候補だけ捨てる", () => {
    expect(
      extractFollowUpEnvelope(
        "回答本文" +
          formatFollowUpEnvelope([
            "配偶者の候補も比べる？",
            "相談メモの日付を見直す？",
          ]),
      ),
    ).toEqual({
      text: "回答本文",
      suggestions: ["配偶者の候補も比べる？", "相談メモの日付を見直す？"],
    });
    expect(
      extractFollowUpEnvelope(
        `回答本文\n${FOLLOW_UP_ENVELOPE_START}\n["一件だけ？"]\n${FOLLOW_UP_ENVELOPE_END}`,
      ),
    ).toEqual({ text: "回答本文", suggestions: [] });
  });
});
describe("モデル設定", () => {
  it("既定モデルと上書き、キーの別名", async () => {
    expect(chainLlmState({}).model).toBe("gemini-3.5-flash");
    expect(chainLlmState({}).fallbackModel).toBe("gemini-3.5-flash-lite");
    expect(
      chainLlmState({ MCP_AGENT_MODEL: "gemini-3.5-flash" }).fallbackModel,
    ).toBe("gemini-3.5-flash-lite");
    expect(
      chainLlmState({
        MCP_AGENT_MODEL: "x",
        MCP_AGENT_FALLBACK_MODEL: "x",
      }).fallbackModel,
    ).toBe("");
    expect(chainLlmState({ MCP_AGENT_FALLBACK_MODEL: "" }).fallbackModel).toBe(
      "",
    );
    expect(chainLlmState({ MCP_AGENT_MODEL: "custom" }).model).toBe("custom");
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test");
    expect(await createAgentModel()).toMatchObject({
      modelId: "gemini-3.5-flash",
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
          request({ mode: "llm", question: "あ".repeat(50000) }, "192.0.2.2"),
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
    const response = await post(
      request({ mode: "llm", question: "例 1990年5月5日生まれ" }),
    );
    expect(
      (
        await post(
          request(
            { mode: "llm", question: "例 1990年5月5日生まれ" },
            "192.0.2.2",
          ),
        )
      ).status,
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

describe("describeAgentFailure", () => {
  it("提供元の状態とquotaIdだけを取り出し、入力は含めない", async () => {
    const { describeAgentFailure } = await import("@/lib/mcpAgent");
    const error = Object.assign(new Error("Bad Request"), {
      name: "AI_APICallError",
      statusCode: 429,
      requestBodyValues: { contents: "秘密の質問" },
      responseBody: JSON.stringify({
        error: {
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded",
          details: [
            {
              violations: [
                { quotaId: "GenerateRequestsPerMinutePerProjectPerModel" },
              ],
            },
          ],
        },
      }),
    });
    const described = describeAgentFailure(error);
    expect(described).toMatchObject({
      statusCode: 429,
      status: "RESOURCE_EXHAUSTED",
      quotaIds: ["GenerateRequestsPerMinutePerProjectPerModel"],
    });
    expect(JSON.stringify(described)).not.toContain("秘密");
  });
});
