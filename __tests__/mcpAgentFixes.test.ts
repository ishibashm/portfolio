// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { hasExplicitBirthDate, UNKNOWN_BIRTH_DATE } from "@/lib/agentInput";
import { AGENT_LIMITS, runAgent, type AgentEvent } from "@/lib/mcpAgent";
import { connectChainClient } from "@/lib/mcpChain";
import { createAgentMock } from "@/lib/mcpAgentMock";
import {
  createAgentEntitlement,
  MemoryUsageLedger,
} from "@/lib/agentEntitlement";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it.each([
  "平成2年5月5日",
  "1990/5/5",
  "5月5日",
  "１９９０年５月５日",
  "生年月日（保存値）: 1990-05-05",
])("明示日付を正規化する: %s", (text) => {
  expect(hasExplicitBirthDate(text, "1990-05-05")).toBe(true);
  expect(hasExplicitBirthDate(text, "1990-07-01")).toBe(false);
});
it("年だけの入力から日付を作らずMCPは両候補を返す", async () => {
  expect(hasExplicitBirthDate("1990年生まれ", "1990-07-01")).toBe(false);
  const c = await connectChainClient();
  try {
    expect(
      await c.call(
        "get_honmei_star",
        { birthYear: 1990 },
        new AbortController().signal,
        8000,
      ),
    ).toMatchObject({ candidates: { beforeSetsubun: 2, afterSetsubun: 1 } });
    expect(
      await c.call(
        "get_honmei_star",
        { birthYear: 1990, bornBeforeSetsubun: false },
        new AbortController().signal,
        8000,
      ),
    ).toMatchObject({ honmeiStar: 1 });
    const call = vi.spyOn(c, "call");
    const events: AgentEvent[] = [];
    await runAgent("1990年生まれ", c, createAgentMock(), (e) => events.push(e));
    expect(call.mock.calls.some(([, args]) => "birthDate" in args)).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ summary: UNKNOWN_BIRTH_DATE, error: true }),
    );
  } finally {
    await c.close();
  }
});
it.each([503, 429])("%iの再試行とフォールバック", async (statusCode) => {
  const good = createAgentMock();
  let attempts = 0;
  const failing = new MockLanguageModelV3({
    modelId: "primary",
    doStream: async (args) => {
      attempts++;
      if (statusCode === 429 || attempts === 2)
        throw Object.assign(new Error("overloaded"), { statusCode });
      return good.doStream(args);
    },
  });
  const c = await connectChainClient();
  const events: AgentEvent[] = [];
  const fallback = vi.fn(async () => createAgentMock());
  const onModel = vi.fn();
  try {
    await runAgent(
      "1990年5月5日",
      c,
      failing,
      (e) => events.push(e),
      undefined,
      AGENT_LIMITS,
      { fallback, onModel },
    );
    expect(events.at(-1)).toMatchObject({ type: "done", reasons: [] });
    expect(fallback).toHaveBeenCalledTimes(1);
    if (statusCode === 429) {
      expect(attempts).toBe(3);
      expect(onModel.mock.calls.at(-1)?.[0]).not.toBe("primary");
    } else
      expect(
        events.filter(
          (e) => e.type === "tool-call" && e.tool === "search_municipality",
        ),
      ).toHaveLength(1);
  } finally {
    await c.close();
  }
});
it("20回設定・全体min・予約・解放と照会は共通の残数", () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("MCP_AGENT_FREE_DAILY_REQUESTS", "20");
  vi.stubEnv("MCP_AGENT_DAILY_REQUESTS", "20");
  delete process.env.MCP_AGENT_FREE_DAILY_TOKENS;
  delete process.env.MCP_AGENT_DAILY_TOKENS;
  const use = createAgentEntitlement(new MemoryUsageLedger());
  const input = { ip: "a", mode: "llm" as const, at: Date.now() };
  for (let i = 0; i < 10; i++)
    expect(use({ ...input, inspect: true }).remaining.requests).toBe(20);
  const first = use(input);
  expect(first.remaining.requests).toBe(19);
  expect(use({ ...input, inspect: true }).remaining.requests).toBe(19);
  first.finish({ model: "fallback", toolCalls: 2 });
  first.finish();
  expect(use({ ...input, ip: "b", inspect: true }).remaining.requests).toBe(19);
  const second = use({ ...input, ip: "b", at: input.at + 30000 });
  expect(second.allowed).toBe(true);
  second.finish();
  expect(use({ ...input, inspect: true }).remaining.requests).toBe(19);
});

it("defaults to 30 personal runs and 100 global runs with derived tokens", () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  for (const key of [
    "MCP_AGENT_FREE_DAILY_REQUESTS",
    "MCP_AGENT_FREE_DAILY_TOKENS",
    "MCP_AGENT_DAILY_REQUESTS",
    "MCP_AGENT_DAILY_TOKENS",
  ])
    vi.stubEnv(key, undefined);
  const ledger = new MemoryUsageLedger();
  const use = createAgentEntitlement(ledger);
  const at = Date.now();
  const input = { ip: "fresh", mode: "llm" as const, at, inspect: true };
  expect(use(input).allowance).toEqual({ requests: 30, tokens: 30 * 524288 });
  expect(use(input).remaining.requests).toBe(30);
  for (let i = 0; i < 99; i++)
    ledger.recordUsage({
      subject: `other-${i}`,
      mode: "llm",
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      voiceSeconds: 0,
      at,
    });
  expect(use(input).remaining.requests).toBe(1);
  ledger.recordUsage({
    subject: "last",
    mode: "llm",
    model: "mock",
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    voiceSeconds: 0,
    at,
  });
  expect(use(input).remaining.requests).toBe(0);
});
