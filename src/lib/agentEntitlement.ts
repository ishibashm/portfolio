import { createHmac, randomBytes } from "node:crypto";
import { TokenBucket, jstDayKey } from "./apiGuard";

export type AgentMode = "llm" | "deterministic";
export interface UsageRecord {
  subject: string;
  mode: AgentMode;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  voiceSeconds: number;
  at: number;
}
export interface UsageLedger {
  recordUsage(record: UsageRecord): void;
  daily(at: number, subject?: string): { requests: number; tokens: number };
}
/** インスタンス内だけの台帳。識別子もログには出さない。 */
export class MemoryUsageLedger implements UsageLedger {
  private day = "";
  private totals = new Map<string, { requests: number; tokens: number }>();
  private roll(at: number) {
    if (this.day !== jstDayKey(at)) {
      this.day = jstDayKey(at);
      this.totals.clear();
    }
  }
  daily(at: number, subject = "*") {
    this.roll(at);
    return this.totals.get(subject) ?? { requests: 0, tokens: 0 };
  }
  recordUsage(r: UsageRecord) {
    this.roll(r.at);
    if (r.mode === "llm") {
      for (const key of ["*", r.subject]) {
        const old = this.daily(r.at, key);
        this.totals.set(key, {
          requests: old.requests + 1,
          tokens: old.tokens + r.inputTokens + r.outputTokens,
        });
      }
    }
    console.info(
      JSON.stringify({
        event: "agent_usage",
        estimated: true,
        mode: r.mode,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        toolCalls: r.toolCalls,
        voiceSeconds: r.voiceSeconds,
        at: r.at,
      }),
    );
  }
}
export const usageLedger: UsageLedger = new MemoryUsageLedger();
export function recordUsage(record: UsageRecord) {
  usageLedger.recordUsage(record);
}
export const resolveAgentPlan = () => "free" as const;
// 再起動時に変わる鍵。IPを辞書攻撃できる単純ハッシュにはしない。
const salt = randomBytes(32);
export function agentSubject(input: {
  userId?: string;
  sessionId?: string;
  ip: string;
}) {
  return createHmac("sha256", salt)
    .update(
      input.userId
        ? `user:${input.userId}`
        : input.sessionId
          ? `session:${input.sessionId}`
          : `ip:${input.ip}`,
    )
    .digest("hex");
}
function limit(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}
// 最大8ステップに再送される道具結果・スキーマを含めた保守的な概算。
// 失敗・切断でも予約分を返さず、費用を小さく見積もらない。
export const AGENT_TOKEN_RESERVATION = 524288;
export function createAgentEntitlement(ledger: UsageLedger = usageLedger) {
  const bucket = new TokenBucket(3, 1 / 20000);
  const globalBucket = new TokenBucket(12, 1 / 5000);
  const agentBucket = new TokenBucket(2, 1 / 30000);
  const agentGlobalBucket = new TokenBucket(6, 1 / 10000);
  let active = 0;
  let agentActive = 0;
  const pending = new Map<symbol, { subject: string; at: number }>();
  return function canUseAgent(input: {
    userId?: string;
    sessionId?: string;
    ip: string;
    mode: AgentMode;
    at?: number;
  }) {
    const at = input.at ?? Date.now();
    const subject = agentSubject(input);
    const plan = resolveAgentPlan();
    const allowance = {
      requests: limit("MCP_AGENT_FREE_DAILY_REQUESTS", 3),
      tokens: limit("MCP_AGENT_FREE_DAILY_TOKENS", 1572864),
    };
    const daily = ledger.daily(at, subject);
    const global = ledger.daily(at);
    const reservations = [...pending.values()].filter(
      (r) => jstDayKey(r.at) === jstDayKey(at),
    );
    const personalPending = reservations.filter(
      (r) => r.subject === subject,
    ).length;
    const remaining = {
      requests: Math.max(
        0,
        allowance.requests - daily.requests - personalPending,
      ),
      tokens: Math.max(
        0,
        allowance.tokens -
          daily.tokens -
          personalPending * AGENT_TOKEN_RESERVATION,
      ),
    };
    let reason = "";
    if (
      !bucket.take(subject, at) ||
      !globalBucket.take("all", at) ||
      (input.mode === "llm" &&
        (!agentBucket.take(subject, at) || !agentGlobalBucket.take("all", at)))
    )
      reason = "実行が続いています。しばらく待ってからお試しください。";
    else if (active >= 2 || (input.mode === "llm" && agentActive >= 1))
      reason = "計算が混み合っています。しばらく待ってください。";
    else if (
      input.mode === "llm" &&
      (remaining.requests < 1 ||
        remaining.tokens < AGENT_TOKEN_RESERVATION ||
        global.requests + reservations.length >=
          limit("MCP_AGENT_DAILY_REQUESTS", 20) ||
        global.tokens + (reservations.length + 1) * AGENT_TOKEN_RESERVATION >
          limit("MCP_AGENT_DAILY_TOKENS", 5242880))
    )
      reason = "本日のAI無料枠に達しました。計算のみの方式をご利用ください。";
    const token = Symbol();
    let released = false;
    if (!reason) {
      active++;
      if (input.mode === "llm") {
        agentActive++;
        pending.set(token, { subject, at });
        remaining.requests--;
        remaining.tokens -= AGENT_TOKEN_RESERVATION;
      }
    }
    return {
      allowed: !reason,
      remaining,
      allowance,
      reason,
      plan,
      subject,
      finish(usage?: { model: string; toolCalls: number }) {
        if (released || reason) return;
        released = true;
        active--;
        if (input.mode === "llm") agentActive--;
        pending.delete(token);
        if (!usage) return; // 入力不正は実行前なので費用を記録しない。
        ledger.recordUsage({
          subject,
          mode: input.mode,
          model: usage.model,
          inputTokens: input.mode === "llm" ? AGENT_TOKEN_RESERVATION : 0,
          outputTokens: 0,
          toolCalls: usage.toolCalls,
          voiceSeconds: 0,
          at,
        });
      },
    };
  };
}
export const canUseAgent = createAgentEntitlement();
