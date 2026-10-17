// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  agentPrice,
  agentCost,
  agentReservation,
  agentDailyBudget,
  pricedFallbackModel,
} from "@/lib/agentPricing";
import {
  createAgentEntitlement,
  MemoryUsageLedger,
  AGENT_TOKEN_RESERVATION,
} from "@/lib/agentEntitlement";
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("MCP_AGENT_PROVIDER", "xai");
  vi.stubEnv("XAI_AGENT_MODEL", "test");
  vi.stubEnv("XAI_AGENT_FALLBACK_MODEL", "");
  vi.stubEnv(
    "MCP_AGENT_PRICING_JSON",
    JSON.stringify({ "xai:test": { input: 0.1, output: 0.2 } }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("未知の単価をnullとして呼び出しを止め、既定Google無料枠だけ明示的に許可", () => {
  expect(agentPrice("xai:unknown")).toBeNull();
  expect(agentPrice("google:gemini-3.5-flash")).toEqual({
    input: 0,
    output: 0,
  });
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "false");
  expect(agentPrice("google:gemini-3.5-flash")).toBeNull();
  vi.stubEnv("XAI_AGENT_MODEL", "unknown");
  const gate = createAgentEntitlement(new MemoryUsageLedger());
  expect(gate({ mode: "llm", ip: "test" })).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("単価が未設定"),
  });
  const calc = gate({ mode: "deterministic", ip: "calc" });
  expect(calc.allowed).toBe(true);
  calc.finish();
});
it("最大単価で予約し、usageで精算する。二重finishは無効", () => {
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const reservation = (AGENT_TOKEN_RESERVATION * 0.2) / 1e6;
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBe(reservation);
  const permit = gate({ mode: "llm", ip: "test", at });
  expect(permit.allowed).toBe(true);
  expect(permit.remaining.usd).toBeCloseTo(0.2 - reservation);
  expect(
    gate({ mode: "llm", ip: "other", at, inspect: true }).remaining.usd,
  ).toBeCloseTo(0.2 - reservation);
  permit.finish({
    model: "xai:test",
    toolCalls: 1,
    complete: true,
    measured: [{ model: "xai:test", inputTokens: 100, outputTokens: 200 }],
  });
  permit.finish({ model: "xai:test", toolCalls: 1 });
  expect(ledger.daily(at).costUsd).toBeCloseTo(0.00005);
  expect(ledger.daily(at).requests).toBe(1);
});
it("失敗・切断・不明usageは予約額を保持して上限で止める", () => {
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const permit = gate({ mode: "llm", ip: "test", at });
  permit.finish({ model: "xai:test", toolCalls: 0 });
  expect(ledger.daily(at).costUsd).toBeCloseTo(
    agentReservation(AGENT_TOKEN_RESERVATION)!,
  );
  expect(gate({ mode: "llm", ip: "test", at: at + 60000 })).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("本日のAI回答の枠"),
  });
});
it("日跨ぎの精算は開始日の台帳だけに反映する", () => {
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.parse("2026-10-17T14:59:59Z");
  const permit = gate({ mode: "llm", ip: "test", at });
  ledger.daily(at + 60000);
  permit.finish({ model: "xai:test", toolCalls: 0 });
  expect(ledger.daily(at).costUsd).toBeGreaterThan(0);
  expect(ledger.daily(at + 60000).costUsd ?? 0).toBe(0);
});
it("単価不明のfallbackは予約に含めず呼ばない。不正値とゼロ予算は閉じる", () => {
  vi.stubEnv("XAI_AGENT_FALLBACK_MODEL", "unpriced");
  expect(pricedFallbackModel()).toBe("");
  expect(agentReservation(100)).toBe((100 * 0.2) / 1e6);
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "NaN");
  expect(agentDailyBudget()).toBe(0);
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "0");
  expect(
    createAgentEntitlement(new MemoryUsageLedger())({ mode: "llm", ip: "test" })
      .allowed,
  ).toBe(false);
  expect(agentCost("xai:test", NaN, 10)).toBeNull();
  expect(agentCost("xai:test", -1, 10)).toBeNull();
});

it("主モデルとfallbackのusageをそれぞれの単価で精算する", () => {
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "1");
  vi.stubEnv("XAI_AGENT_FALLBACK_MODEL", "fallback");
  vi.stubEnv(
    "MCP_AGENT_PRICING_JSON",
    JSON.stringify({
      "xai:test": { input: 0.1, output: 0.2 },
      "xai:fallback": { input: 0.3, output: 0.8 },
    }),
  );
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const permit = gate({ mode: "llm", ip: "test", at });
  expect(permit.allowed).toBe(true);
  expect(permit.remaining.usd).toBeCloseTo(
    1 - (AGENT_TOKEN_RESERVATION * 0.8) / 1e6,
  );
  permit.finish({
    model: "xai:fallback",
    toolCalls: 0,
    complete: true,
    measured: [
      { model: "xai:test", inputTokens: 100, outputTokens: 100 },
      { model: "xai:fallback", inputTokens: 100, outputTokens: 100 },
    ],
  });
  expect(ledger.daily(at).costUsd).toBeCloseTo(0.00014);
});
it("単価不明の切替先は呼ばず、単価のある主モデルは止めない", () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
  vi.stubEnv("MCP_AGENT_MODEL", "gemini-3.5-flash");
  vi.stubEnv("MCP_AGENT_FALLBACK_MODEL", "gemini-unknown");
  expect(pricedFallbackModel()).toBe("");
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBe(0);
  const gate = createAgentEntitlement(new MemoryUsageLedger());
  const permit = gate({ mode: "llm", ip: "fallback" });
  expect(permit.allowed).toBe(true);
  permit.finish();
  vi.stubEnv("MCP_AGENT_FALLBACK_MODEL", "gemini-3.5-flash-lite");
  expect(pricedFallbackModel()).toBe("gemini-3.5-flash-lite");
  vi.stubEnv("MCP_AGENT_MODEL", "gemini-unknown");
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBeNull();
});
