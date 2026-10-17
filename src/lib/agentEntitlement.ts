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
  private days = new Map<
    string,
    Map<string, { requests: number; tokens: number }>
  >();
  private roll(at: number) {
    const key = jstDayKey(at);
    if (!this.days.has(key)) this.days.set(key, new Map());
    // 日付を跨いで完了した実行は開始日に記録する。新しい日の台帳を消さない。
    if (this.days.size > 2) this.days.delete([...this.days.keys()].sort()[0]);
    return this.days.get(key);
  }
  daily(at: number, subject = "*") {
    return this.roll(at)?.get(subject) ?? { requests: 0, tokens: 0 };
  }
  recordUsage(r: UsageRecord) {
    const totals = this.roll(r.at);
    if (r.mode === "llm") {
      for (const key of ["*", r.subject]) {
        const old = this.daily(r.at, key);
        totals?.set(key, {
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
// Route bundles in one Node process must share both accounting and rate limits.
const agentGlobal = globalThis as typeof globalThis & {
  mcpAgentLedger?: MemoryUsageLedger;
  mcpAgentGate?: ReturnType<typeof createAgentEntitlement>;
  mcpAgentSalt?: Buffer;
};
export const usageLedger =
  process.env.NODE_ENV === "test"
    ? new MemoryUsageLedger()
    : (agentGlobal.mcpAgentLedger ??= new MemoryUsageLedger());
export function recordUsage(record: UsageRecord) {
  usageLedger.recordUsage(record);
}
export const resolveAgentPlan = () => "free" as const;
// 再起動時に変わる鍵。IPを辞書攻撃できる単純ハッシュにはしない。
const salt = (agentGlobal.mcpAgentSalt ??= randomBytes(32));
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
    inspect?: boolean;
  }) {
    const at = input.at ?? Date.now();
    const subject = agentSubject(input);
    const plan = resolveAgentPlan();
    const allowance = {
      requests: limit("MCP_AGENT_FREE_DAILY_REQUESTS", 30),
      tokens: limit(
        "MCP_AGENT_FREE_DAILY_TOKENS",
        limit("MCP_AGENT_FREE_DAILY_REQUESTS", 30) * AGENT_TOKEN_RESERVATION,
      ),
    };
    const globalAllowance = {
      requests: limit("MCP_AGENT_DAILY_REQUESTS", 100),
      tokens: limit(
        "MCP_AGENT_DAILY_TOKENS",
        limit("MCP_AGENT_DAILY_REQUESTS", 100) * AGENT_TOKEN_RESERVATION,
      ),
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
    remaining.tokens = Math.min(
      remaining.tokens,
      Math.max(
        0,
        globalAllowance.tokens -
          global.tokens -
          reservations.length * AGENT_TOKEN_RESERVATION,
      ),
    );
    remaining.requests = Math.min(
      Math.max(
        0,
        globalAllowance.requests - global.requests - reservations.length,
      ),
      remaining.requests,
      Math.floor(remaining.tokens / AGENT_TOKEN_RESERVATION),
    );
    let reason = "";
    if (
      !input.inspect &&
      (!bucket.take(subject, at) ||
        !globalBucket.take("all", at) ||
        (input.mode === "llm" &&
          (!agentBucket.take(subject, at) ||
            !agentGlobalBucket.take("all", at))))
    )
      reason = "短時間の実行回数上限です。しばらく待ってからお試しください。";
    else if (active >= 2 || (input.mode === "llm" && agentActive >= 1))
      reason = "計算が混み合っています。しばらく待ってください。";
    else if (
      input.mode === "llm" &&
      (remaining.requests < 1 ||
        remaining.tokens < AGENT_TOKEN_RESERVATION ||
        global.requests + reservations.length >= globalAllowance.requests ||
        global.tokens + (reservations.length + 1) * AGENT_TOKEN_RESERVATION >
          globalAllowance.tokens)
    )
      reason = "本日のAI無料枠に達しました。計算のみの方式をご利用ください。";
    const token = Symbol();
    let released = false;
    if (!reason && !input.inspect) {
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
      finish(usage?: {
        model: string;
        toolCalls: number;
        voiceSeconds?: number;
      }) {
        if (released || reason || input.inspect) return;
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
          voiceSeconds: usage.voiceSeconds ?? 0,
          at,
        });
      },
    };
  };
}
export const canUseAgent =
  process.env.NODE_ENV === "test"
    ? createAgentEntitlement()
    : (agentGlobal.mcpAgentGate ??= createAgentEntitlement());
