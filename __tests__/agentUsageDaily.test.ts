// @vitest-environment node
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_TOKEN_RESERVATION,
  agentGlobalSubject,
  agentSubject,
  createAgentEntitlement,
  DbUsageLedger,
  prepareAgentEntitlement,
  type AgentUsageDb,
  type AgentUsageDbRow,
} from "@/lib/agentEntitlement";
import { jstDayKey } from "@/lib/apiGuard";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_MOCK", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DbUsageLedger persistence", () => {
  it("hydrate takes max of memory vs DB for subject and global rows", async () => {
    vi.stubEnv("API_SECRET_KEY", "test-secret-key");
    const at = Date.UTC(2026, 10, 3, 1, 0, 0);
    const day = jstDayKey(at);
    const subject = agentSubject({ ip: "203.0.113.10" });
    const globalHash = agentGlobalSubject();

    const dbRows: AgentUsageDbRow[] = [
      {
        subject_hash: subject,
        requests: 5,
        tokens: 1000,
        cost_usd: 0.08,
      },
      {
        subject_hash: globalHash,
        requests: 12,
        tokens: 8000,
        cost_usd: 0.15,
      },
    ];
    const fakePrisma: AgentUsageDb = {
      $queryRaw: vi.fn(async () => dbRows) as AgentUsageDb["$queryRaw"],
      $executeRaw: vi.fn(async () => 1),
    };

    const ledger = new DbUsageLedger(fakePrisma);
    // Pre-populate memory with higher tokens for subject, but lower requests/costUsd
    ledger.recordUsage({
      subject,
      mode: "llm",
      model: "mock",
      inputTokens: 5000,
      outputTokens: 0,
      toolCalls: 0,
      voiceSeconds: 0,
      at,
      costUsd: 0.01,
    });
    await ledger.flush();

    expect(await ledger.hydrate(subject, day)).toBe(true);
    expect(ledger.daily(at, subject)).toEqual({
      requests: 5,
      tokens: 5000,
      costUsd: 0.08,
    });
    expect(ledger.daily(at)).toEqual({
      requests: 12,
      tokens: 8000,
      costUsd: 0.15,
    });

    // Hydrated positive costUsd blocks subsequent LLM calls with spend_cap even when free tier / mock is active
    vi.stubEnv("MCP_AGENT_MAX_SPEND_USD", "100");
    vi.stubEnv("MCP_AGENT_GOOGLE_FREE_TIER", "true");
    const gate = createAgentEntitlement(ledger);
    expect(gate({ ip: "203.0.113.10", mode: "llm", at })).toMatchObject({
      allowed: false,
      code: "spend_cap",
      reason: expect.stringContaining("spend_cap"),
    });
  });

  it("recordUsage upserts increments into agent_usage_daily and logs warning code on failure", async () => {
    vi.stubEnv("API_SECRET_KEY", "test-secret-key");
    const at = Date.UTC(2026, 10, 3, 2, 0, 0);
    const subject = agentSubject({ ip: "198.51.100.5" });
    const queries: string[] = [];
    const valuesList: unknown[][] = [];

    const fakePrisma: AgentUsageDb = {
      $queryRaw: vi.fn(async () => []) as AgentUsageDb["$queryRaw"],
      $executeRaw: vi.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          queries.push(strings.join("?"));
          valuesList.push(values);
          return 1;
        },
      ),
    };

    const ledger = new DbUsageLedger(fakePrisma);
    ledger.recordUsage({
      subject,
      mode: "llm",
      model: "google:gemini-3.6-flash",
      inputTokens: 100,
      outputTokens: 200,
      toolCalls: 1,
      voiceSeconds: 0,
      at,
      costUsd: 0.00165,
    });
    await ledger.flush();

    expect(fakePrisma.$executeRaw).toHaveBeenCalledTimes(2);
    for (const q of queries) {
      expect(q).toContain("INSERT INTO agent_usage_daily");
      expect(q).toContain("ON CONFLICT (day, subject_hash) DO UPDATE");
      expect(q).toContain(
        "requests = agent_usage_daily.requests + EXCLUDED.requests",
      );
    }
    expect(valuesList.map((v) => v[1]).sort()).toEqual(
      [agentGlobalSubject(), subject].sort(),
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingPrisma: AgentUsageDb = {
      $executeRaw: vi.fn(async () => {
        throw Object.assign(
          new Error("sensitive SQL detail must not be logged"),
          { code: "P2021" },
        );
      }),
    };
    const failingLedger = new DbUsageLedger(failingPrisma);
    failingLedger.recordUsage({
      subject,
      mode: "llm",
      model: "mock",
      inputTokens: 10,
      outputTokens: 10,
      toolCalls: 0,
      voiceSeconds: 0,
      at,
    });
    await failingLedger.flush();
    expect(warn).toHaveBeenCalledOnce();
    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toEqual({
      severity: "WARNING",
      message: "[agent] usage ledger unavailable",
      reason: "P2021",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive SQL");
  });

  it("hydrate failure fails closed for LLM calls while allowing deterministic path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakePrisma: AgentUsageDb = {
      $queryRaw: vi.fn(async () => {
        throw Object.assign(new Error("connection refused secret-url"), {
          code: "ECONNREFUSED",
        });
      }) as AgentUsageDb["$queryRaw"],
      $executeRaw: vi.fn(async () => 1),
    };
    const ledger = new DbUsageLedger(fakePrisma);
    const gate = createAgentEntitlement(ledger);
    const at = Date.UTC(2026, 10, 3, 3, 0, 0);

    const ok = await prepareAgentEntitlement({ ip: "192.0.2.55", at }, ledger);
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
      severity: "WARNING",
      message: "[agent] usage ledger unavailable",
      reason: "ECONNREFUSED",
    });

    const llmPermit = gate({ ip: "192.0.2.55", mode: "llm", at });
    expect(llmPermit.allowed).toBe(false);

    const detPermit = gate({ ip: "192.0.2.55", mode: "deterministic", at });
    expect(detPermit.allowed).toBe(true);
    detPermit.finish({ model: "none", toolCalls: 1 });
  });

  it("stable salt produces identical subject across restarts when secret is set", async () => {
    const env1 = { API_SECRET_KEY: "stable-secret-123" };
    const env2 = { NEXTAUTH_SECRET: "stable-secret-123" };
    const first = agentSubject({ ip: "203.0.113.99" }, env1);
    const second = agentSubject({ ip: "203.0.113.99" }, env2);
    expect(first).toHaveLength(64);
    expect(first).toBe(second);
    expect(agentGlobalSubject(env1)).toBe(agentGlobalSubject(env2));
    expect(agentGlobalSubject(env1)).not.toBe(first);

    vi.stubEnv("API_SECRET_KEY", "stable-secret-123");
    const globalRef = globalThis as typeof globalThis & {
      mcpAgentSalt?: Buffer;
    };
    const prevSalt = globalRef.mcpAgentSalt;
    try {
      delete globalRef.mcpAgentSalt;
      vi.resetModules();
      const reloaded = await import("@/lib/agentEntitlement");
      expect(reloaded.agentSubject({ ip: "203.0.113.99" })).toBe(first);
      expect(reloaded.agentGlobalSubject()).toBe(agentGlobalSubject(env1));
    } finally {
      globalRef.mcpAgentSalt = prevSalt;
    }
  });
});

describe("prisma/sql/20261103_add_agent_usage_daily.sql contract", () => {
  const sql = readFileSync(
    "prisma/sql/20261103_add_agent_usage_daily.sql",
    "utf8",
  );

  it("contains only CREATE ... IF NOT EXISTS statements and no destructive DDL/DML", () => {
    const statements = sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBe(2);
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE (?:TABLE|INDEX) IF NOT EXISTS\b/i);
    }
    expect(sql).not.toMatch(
      /\b(?:DROP|DELETE|TRUNCATE|ALTER\s+TABLE\s+\S+\s+DROP)\b/i,
    );
    expect(sql).toContain(
      "2026-11-03 に本人の承認あり（MCP セキュリティ修正）。マージ後に Apply additive SQL で当てる。",
    );
    expect(sql).not.toContain("この変更では本番へ当てない");
  });

  it("matches AgentUsageDaily model in prisma/schema.prisma", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block =
      schema.match(/model\s+AgentUsageDaily\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(block).toContain("@@id([day, subjectHash])");
    expect(block).toContain('@@map("agent_usage_daily")');

    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "AgentUsageDaily",
    );
    expect(model).toBeDefined();
    expect(model?.dbName).toBe("agent_usage_daily");
    expect(model?.fields.map((f) => [f.name, f.dbName ?? f.name])).toEqual([
      ["day", "day"],
      ["subjectHash", "subject_hash"],
      ["requests", "requests"],
      ["tokens", "tokens"],
      ["costUsd", "cost_usd"],
      ["updatedAt", "updated_at"],
    ]);
    expect(AGENT_TOKEN_RESERVATION).toBe(524288);
  });
});
