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
it("未知の単価をnullとして呼び出しを止め、既定GoogleはMCP_AGENT_GOOGLE_FREE_TIER==='true'のときだけ0ドル、PRICING_JSONによる単価引き下げを拒否する", () => {
  expect(agentPrice("xai:unknown")).toBeNull();
  expect(agentPrice("google:gemini-3.5-flash")).toBeNull();
  for (const val of [undefined, "", "false", "TRUE", "1", "yes"]) {
    if (val === undefined) {
      delete process.env.MCP_AGENT_GOOGLE_FREE_TIER;
    } else {
      vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", val);
    }
    expect(agentPrice("google:gemini-3.6-flash")).toEqual({
      input: 1.5,
      output: 7.5,
    });
    expect(agentPrice("google:gemini-3.5-flash-lite")).toEqual({
      input: 0.3,
      output: 2.5,
    });
  }
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  expect(agentPrice("google:gemini-3.6-flash")).toEqual({
    input: 0,
    output: 0,
  });
  expect(agentPrice("google:gemini-3.5-flash-lite")).toEqual({
    input: 0,
    output: 0,
  });
  expect(agentPrice("google:gemini-3.5-flash")).toBeNull();
  expect(agentPrice("xai:unknown")).toBeNull();
  expect(agentPrice("xai:test")).toEqual({ input: 0.1, output: 0.2 });

  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "false");
  vi.stubEnv(
    "MCP_AGENT_PRICING_JSON",
    JSON.stringify({
      "google:gemini-3.6-flash": { input: 0, output: 0 },
      "google:gemini-3.5-flash-lite": { input: 0.1, output: 3.0 },
      "xai:zero": { input: 0, output: 0 },
    }),
  );
  expect(agentPrice("google:gemini-3.6-flash")).toEqual({
    input: 1.5,
    output: 7.5,
  });
  expect(agentPrice("google:gemini-3.5-flash-lite")).toEqual({
    input: 0.3,
    output: 3.0,
  });
  expect(agentPrice("xai:zero")).toBeNull();

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
it("予約額>0はspend_capで拒否し、無料枠で実行後に正のcostが記録されたら同日の後続呼び出しを拒否する。二重finishは無効", () => {
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const reservation = (AGENT_TOKEN_RESERVATION * 0.2) / 1e6;
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBe(reservation);
  expect(gate({ mode: "llm", ip: "test", at })).toMatchObject({
    allowed: false,
    code: "spend_cap",
    reason: expect.stringContaining("spend_cap"),
  });

  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBe(0);

  const permit = gate({ mode: "llm", ip: "free-user", at: at + 35000 });
  expect(permit.allowed).toBe(true);
  expect(permit.remaining.usd).toBe(0);
  permit.finish({
    model: "xai:test",
    toolCalls: 1,
    complete: true,
    measured: [{ model: "xai:test", inputTokens: 100, outputTokens: 200 }],
  });
  permit.finish({ model: "xai:test", toolCalls: 1 });
  expect(ledger.daily(at + 35000).costUsd).toBeCloseTo(0.00005);
  expect(ledger.daily(at + 35000).requests).toBe(1);

  expect(gate({ mode: "llm", ip: "other-user", at: at + 70000 })).toMatchObject(
    {
      allowed: false,
      code: "spend_cap",
      reason: expect.stringContaining("spend_cap"),
    },
  );
});
it("不完全な完了でも測定された正の費用を落とさず記録して後続を止める", () => {
  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const permit = gate({ mode: "llm", ip: "test", at });
  expect(permit.allowed).toBe(true);
  permit.finish({
    model: "xai:test",
    toolCalls: 0,
    complete: false,
    measured: [{ model: "xai:test", inputTokens: 100, outputTokens: 200 }],
  });
  expect(ledger.daily(at).costUsd).toBeCloseTo(0.00005);
  expect(gate({ mode: "llm", ip: "test", at: at + 60000 })).toMatchObject({
    allowed: false,
    code: "spend_cap",
    reason: expect.stringContaining("spend_cap"),
  });
});
it("日跨ぎの精算は開始日の台帳だけに反映する", () => {
  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.parse("2026-10-17T14:59:59Z");
  const permit = gate({ mode: "llm", ip: "test", at });
  expect(permit.allowed).toBe(true);
  ledger.daily(at + 60000);
  permit.finish({
    model: "xai:test",
    toolCalls: 0,
    complete: true,
    measured: [{ model: "xai:test", inputTokens: 100, outputTokens: 200 }],
  });
  expect(ledger.daily(at).costUsd).toBeGreaterThan(0);
  expect(ledger.daily(at + 60000).costUsd ?? 0).toBe(0);
});
it("単価不明のfallbackは予約に含めず呼ばない。不正値とゼロ予算は閉じる", () => {
  vi.stubEnv("XAI_AGENT_FALLBACK_MODEL", "unpriced");
  expect(pricedFallbackModel()).toBe("");
  expect(agentReservation(100)).toBe((100 * 0.2) / 1e6);
  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "NaN");
  expect(agentDailyBudget()).toBe(0);
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "0");
  expect(
    createAgentEntitlement(new MemoryUsageLedger())({
      mode: "llm",
      ip: "test",
    }),
  ).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("本日のAI回答の枠"),
  });
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
  expect(agentReservation(AGENT_TOKEN_RESERVATION)).toBeCloseTo(
    (AGENT_TOKEN_RESERVATION * 0.8) / 1e6,
  );
  vi.stubEnv("MCP_AGENT_PROVIDER", "google");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 9, 17);
  const permit = gate({ mode: "llm", ip: "test", at });
  expect(permit.allowed).toBe(true);
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
  vi.stubEnv("MCP_AGENT_MODEL", "gemini-3.6-flash");
  vi.stubEnv("MCP_AGENT_FALLBACK_MODEL", "gemini-unknown");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
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
it("MCP_AGENT_MAX_SPEND_USD=100は無効であり、無料枠明示・開発モック・計算のみを許可し、正の費用記録後はspend_capで拒否する", () => {
  vi.unstubAllEnvs();
  vi.stubEnv("MCP_AGENT_MAX_SPEND_USD", "100");
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "100");
  const ledger = new MemoryUsageLedger();
  const gate = createAgentEntitlement(ledger);
  const at = Date.UTC(2026, 10, 3);

  // 既定GoogleでもMCP_AGENT_GOOGLE_FREE_TIER未設定なら予約額>0でspend_cap拒否（MCP_AGENT_MAX_SPEND_USD=100は無効）
  const deniedDefault = gate({ mode: "llm", ip: "user-1", at });
  expect(deniedDefault.allowed).toBe(false);
  expect(deniedDefault.reason).toContain("spend_cap");
  expect(deniedDefault.code).toBe("spend_cap");

  // 計算のみは許可
  const det = gate({ mode: "deterministic", ip: "user-1", at });
  expect(det.allowed).toBe(true);
  det.finish();

  // 開発モックは許可
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_MOCK", "true");
  const mockPermit = gate({ mode: "llm", ip: "user-2", at: at + 35000 });
  expect(mockPermit.allowed).toBe(true);
  mockPermit.finish({ model: "mock", toolCalls: 1 });

  // 明示的なGoogle無料枠（"true"）は許可
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MCP_AGENT_MOCK", "false");
  vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
  const freePermit = gate({ mode: "llm", ip: "user-3", at: at + 70000 });
  expect(freePermit.allowed).toBe(true);
  // 完了時に正の費用が報告されたら台帳に記録し、以後のLLM呼び出しをすべて拒否する
  freePermit.finish({
    model: "google:gemini-3.6-flash",
    toolCalls: 1,
    costUsd: 0.001,
  });
  expect(ledger.daily(at + 70000).costUsd).toBeCloseTo(0.001);

  const afterPositiveCost = gate({
    mode: "llm",
    ip: "user-4",
    at: at + 105000,
  });
  expect(afterPositiveCost.allowed).toBe(false);
  expect(afterPositiveCost.reason).toContain("spend_cap");
  expect(afterPositiveCost.code).toBe("spend_cap");
});
