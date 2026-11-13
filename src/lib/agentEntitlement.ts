import { agentCost, agentDailyBudget, agentReservation } from "./agentPricing";
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
  costUsd?: number;
}
export interface UsageLedger {
  recordUsage(record: UsageRecord): void;
  daily(
    at: number,
    subject?: string,
  ): { requests: number; tokens: number; costUsd?: number };
  hydrate?(subjectHash: string, day?: string): Promise<boolean>;
  isHealthy?(at: number, subject?: string): boolean;
}
/** インスタンス内だけの台帳。識別子もログには出さない。 */
export class MemoryUsageLedger implements UsageLedger {
  protected days = new Map<
    string,
    Map<string, { requests: number; tokens: number; costUsd?: number }>
  >();
  protected rollDay(key: string) {
    if (!this.days.has(key)) this.days.set(key, new Map());
    // 日付を跨いで完了した実行は開始日に記録する。新しい日の台帳を消さない。
    if (this.days.size > 2) this.days.delete([...this.days.keys()].sort()[0]);
    return this.days.get(key)!;
  }
  protected roll(at: number) {
    return this.rollDay(jstDayKey(at));
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
          costUsd: (old.costUsd ?? 0) + (r.costUsd ?? 0),
          tokens: old.tokens + r.inputTokens + r.outputTokens,
        });
      }
    }
    console.info(
      JSON.stringify({
        event: "agent_usage",
        costUsd: r.costUsd ?? null,
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

export type AgentUsageDbRow = {
  subject_hash?: string;
  subjectHash?: string;
  requests: number | bigint;
  tokens: number | bigint;
  cost_usd?: number;
  costUsd?: number;
};

export type AgentUsageDb = {
  $queryRaw?<T = AgentUsageDbRow[]>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  agentUsageDaily?: {
    findMany(args: {
      where: { day: Date; subjectHash: { in: string[] } };
    }): Promise<AgentUsageDbRow[]>;
  };
};

const DB_TIMEOUT_MS = 1500;
const GLOBAL_ZERO_SUBJECT = "0".repeat(64);

function warnLedgerUnavailable(error: unknown) {
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  const reason =
    typeof rawCode === "string" && rawCode
      ? rawCode
      : typeof rawCode === "number"
        ? String(rawCode)
        : error instanceof Error && error.message === "TIMEOUT"
          ? "TIMEOUT"
          : "UNKNOWN";
  console.warn(
    JSON.stringify({
      severity: "WARNING",
      message: `[agent] usage ledger unavailable: ${reason}`,
      reason,
    }),
  );
}

async function withDbTimeout<T>(
  work: Promise<T>,
  ms = DB_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("TIMEOUT") as Error & { code: string };
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class DbUsageLedger extends MemoryUsageLedger {
  private failedSubjects = new Set<string>();
  private lastHydrateFailed = false;
  private pendingWrites = new Set<Promise<void>>();

  constructor(
    private readonly db?: AgentUsageDb,
    private readonly timeoutMs = DB_TIMEOUT_MS,
  ) {
    super();
  }

  private async loadDb(): Promise<AgentUsageDb> {
    if (this.db) return this.db;
    const { default: prisma } = await import("./prisma");
    return prisma as unknown as AgentUsageDb;
  }

  private mergeRow(
    day: string,
    key: string,
    dbRow: { requests: number; tokens: number; costUsd: number },
  ) {
    const map = this.rollDay(day);
    const old = map.get(key) ?? { requests: 0, tokens: 0, costUsd: 0 };
    map.set(key, {
      requests: Math.max(old.requests, dbRow.requests),
      tokens: Math.max(old.tokens, dbRow.tokens),
      costUsd: Math.max(old.costUsd ?? 0, dbRow.costUsd),
    });
  }

  isHealthy(at: number, subject?: string): boolean {
    if (this.lastHydrateFailed) return false;
    if (subject && this.failedSubjects.has(`${jstDayKey(at)}:${subject}`))
      return false;
    return true;
  }

  async hydrate(
    subjectHash: string,
    day: string = jstDayKey(Date.now()),
  ): Promise<boolean> {
    const globalHash = agentGlobalSubject();
    try {
      const db = this.db ?? (await this.loadDb());
      const rows =
        typeof db.$queryRaw === "function"
          ? await withDbTimeout(
              db.$queryRaw<AgentUsageDbRow[]>`
                SELECT subject_hash::text AS subject_hash,
                       requests,
                       tokens,
                       cost_usd
                FROM agent_usage_daily
                WHERE day = ${day}::date
                  AND subject_hash IN (${subjectHash}, ${globalHash})
              `,
              this.timeoutMs,
            )
          : db.agentUsageDaily?.findMany
            ? await withDbTimeout(
                db.agentUsageDaily.findMany({
                  where: {
                    day: new Date(`${day}T00:00:00.000Z`),
                    subjectHash: { in: [subjectHash, globalHash] },
                  },
                }),
                this.timeoutMs,
              )
            : (() => {
                throw Object.assign(new Error("DB_UNAVAILABLE"), {
                  code: "DB_UNAVAILABLE",
                });
              })();
      if (!Array.isArray(rows)) {
        throw Object.assign(new Error("INVALID_ROWS"), {
          code: "INVALID_ROWS",
        });
      }
      for (const row of rows) {
        const hash = String(row.subject_hash ?? row.subjectHash ?? "").trim();
        const parsed = {
          requests: Number(row.requests ?? 0),
          tokens: Number(row.tokens ?? 0),
          costUsd: Number(row.cost_usd ?? row.costUsd ?? 0),
        };
        if (hash === subjectHash) {
          this.mergeRow(day, subjectHash, parsed);
        }
        if (
          hash === globalHash ||
          hash === GLOBAL_ZERO_SUBJECT ||
          hash === "*" ||
          hash === "global"
        ) {
          this.mergeRow(day, "*", parsed);
        }
      }
      this.failedSubjects.delete(`${day}:${subjectHash}`);
      this.lastHydrateFailed = false;
      return true;
    } catch (error) {
      this.failedSubjects.add(`${day}:${subjectHash}`);
      this.lastHydrateFailed = true;
      warnLedgerUnavailable(error);
      return false;
    }
  }

  override recordUsage(r: UsageRecord) {
    super.recordUsage(r);
    if (r.mode !== "llm") return;
    const day = jstDayKey(r.at);
    const tokens = r.inputTokens + r.outputTokens;
    const costUsd = r.costUsd ?? 0;
    const globalHash = agentGlobalSubject();
    const write = (async () => {
      try {
        const db = this.db ?? (await this.loadDb());
        await withDbTimeout(
          Promise.all(
            [globalHash, r.subject].map(
              (subjectHash) => db.$executeRaw`
                INSERT INTO agent_usage_daily (
                  day, subject_hash, requests, tokens, cost_usd, updated_at
                )
                VALUES (
                  ${day}::date, ${subjectHash}, 1, ${tokens}, ${costUsd}, now()
                )
                ON CONFLICT (day, subject_hash) DO UPDATE
                SET requests = agent_usage_daily.requests + EXCLUDED.requests,
                    tokens = agent_usage_daily.tokens + EXCLUDED.tokens,
                    cost_usd = agent_usage_daily.cost_usd + EXCLUDED.cost_usd,
                    updated_at = now()
              `,
            ),
          ),
          this.timeoutMs,
        );
      } catch (error) {
        warnLedgerUnavailable(error);
      }
    })();
    this.pendingWrites.add(write);
    void write.finally(() => {
      this.pendingWrites.delete(write);
    });
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pendingWrites]);
  }
}

// Route bundles in one Node process must share both accounting and rate limits.
const agentGlobal = globalThis as typeof globalThis & {
  mcpAgentLedger?: UsageLedger;
  mcpAgentGate?: ReturnType<typeof createAgentEntitlement>;
  mcpAgentSalt?: Buffer;
};
export const usageLedger: UsageLedger =
  process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)
    ? new MemoryUsageLedger()
    : (agentGlobal.mcpAgentLedger ??= new DbUsageLedger());
export function recordUsage(record: UsageRecord) {
  usageLedger.recordUsage(record);
}
export const resolveAgentPlan = () => "free" as const;
// API_SECRET_KEY / NEXTAUTH_SECRET があれば再起動を跨いで安定する鍵を使う。
const fallbackSalt = (agentGlobal.mcpAgentSalt ??= randomBytes(32));
function subjectHmacKey(
  env: Record<string, string | undefined> = process.env,
): string | Buffer {
  const secret = env.API_SECRET_KEY?.trim() || env.NEXTAUTH_SECRET?.trim();
  return secret ? `agent-subject-v1:${secret}` : fallbackSalt;
}
export function agentSubject(
  input: {
    userId?: string;
    sessionId?: string;
    ip: string;
  },
  env: Record<string, string | undefined> = process.env,
) {
  return createHmac("sha256", subjectHmacKey(env))
    .update(
      input.userId
        ? `user:${input.userId}`
        : input.sessionId
          ? `session:${input.sessionId}`
          : `ip:${input.ip}`,
    )
    .digest("hex");
}
export function agentGlobalSubject(
  env: Record<string, string | undefined> = process.env,
) {
  return createHmac("sha256", subjectHmacKey(env))
    .update("global")
    .digest("hex");
}
export async function prepareAgentEntitlement(
  input:
    | string
    | {
        userId?: string;
        sessionId?: string;
        ip: string;
        at?: number;
      },
  dayOrLedger?: string | UsageLedger,
  maybeLedger: UsageLedger = usageLedger,
): Promise<boolean> {
  const subject = typeof input === "string" ? input : agentSubject(input);
  const at =
    typeof input === "object" && input !== null && typeof input.at === "number"
      ? input.at
      : Date.now();
  const day = typeof dayOrLedger === "string" ? dayOrLedger : jstDayKey(at);
  const ledger =
    typeof dayOrLedger === "object" && dayOrLedger !== null
      ? dayOrLedger
      : maybeLedger;
  if (ledger.hydrate) {
    return ledger.hydrate(subject, day);
  }
  return true;
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
  const pending = new Map<
    symbol,
    { subject: string; at: number; costUsd: number }
  >();
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
    const reservedUsd =
      input.mode === "llm" ? agentReservation(AGENT_TOKEN_RESERVATION) : 0;
    const maxSpendUsd = 0;
    const dailyBudgetUsd = agentDailyBudget();
    const spentUsd =
      (global.costUsd ?? 0) +
      reservations.reduce((sum, r) => sum + r.costUsd, 0);
    const remainingSpendCapUsd = Math.max(0, maxSpendUsd - spentUsd);
    const remainingBudgetUsd = Math.max(0, dailyBudgetUsd - spentUsd);
    const remainingUsd = Math.min(remainingBudgetUsd, remainingSpendCapUsd);
    const remaining = {
      usd: remainingUsd,
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
    let code: string | undefined;
    if (
      input.mode === "llm" &&
      ledger.isHealthy &&
      !ledger.isHealthy(at, subject)
    ) {
      reason = "利用量の確認に失敗しました。計算のみの方式をご利用ください。";
      code = "ledger_unavailable";
    } else if (
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
    if (!reason && input.mode === "llm") {
      if (reservedUsd === null) {
        reason = "AI回答の単価が未設定です。計算のみの方式をご利用ください。";
      } else if (
        reservedUsd > maxSpendUsd ||
        (global.costUsd ?? 0) > maxSpendUsd ||
        spentUsd > maxSpendUsd
      ) {
        reason =
          "spend_cap: 本日のAI回答の枠が終わりました。計算のみの方式・FAQをご利用ください。";
        code = "spend_cap";
      } else if (reservedUsd > remainingBudgetUsd || dailyBudgetUsd === 0) {
        reason =
          "本日のAI回答の枠が終わりました。計算のみの方式・FAQをご利用ください。";
      }
    }
    const token = Symbol();
    let released = false;
    if (!reason && !input.inspect) {
      active++;
      if (input.mode === "llm") {
        agentActive++;
        pending.set(token, { subject, at, costUsd: reservedUsd ?? 0 });
        remaining.usd = Math.max(0, remainingUsd - (reservedUsd ?? 0));
        remaining.requests--;
        remaining.tokens -= AGENT_TOKEN_RESERVATION;
      }
    }
    return {
      allowed: !reason,
      remaining,
      allowance,
      reason,
      ...(code ? { code } : {}),
      plan,
      subject,
      finish(usage?: {
        model: string;
        toolCalls: number;
        voiceSeconds?: number;
        costUsd?: number;
        measured?: {
          model: string;
          inputTokens: number;
          outputTokens: number;
        }[];
        complete?: boolean;
      }) {
        if (released || reason || input.inspect) return;
        released = true;
        active--;
        if (input.mode === "llm") agentActive--;
        pending.delete(token);
        if (!usage) return; // 入力不正は実行前なので費用を記録しない。
        const costs = usage.measured?.map((entry) =>
          agentCost(entry.model, entry.inputTokens, entry.outputTokens),
        );
        const measuredUsd =
          costs?.reduce<number>(
            (sum, cost) => sum + (cost !== null && cost > 0 ? cost : 0),
            0,
          ) ?? 0;
        const settledUsd =
          usage.complete &&
          costs?.length &&
          costs.every((cost) => cost !== null)
            ? costs.reduce<number>((sum, cost) => sum + cost!, 0)
            : Math.max(reservedUsd ?? 0, measuredUsd);
        const reportedUsd =
          typeof usage.costUsd === "number" &&
          Number.isFinite(usage.costUsd) &&
          usage.costUsd > 0
            ? usage.costUsd
            : 0;
        const finalCostUsd = Math.max(settledUsd, reportedUsd, measuredUsd);
        ledger.recordUsage({
          costUsd: input.mode === "llm" ? finalCostUsd : 0,
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
  process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)
    ? createAgentEntitlement()
    : (agentGlobal.mcpAgentGate ??= createAgentEntitlement());
