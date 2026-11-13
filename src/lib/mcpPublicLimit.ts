import { createHash, createHmac } from "node:crypto";
import { clientKey } from "@/lib/apiGuard";
import { errorCode } from "@/lib/errorMessage";
import { MCP_PUBLIC_TOOL_NAMES } from "@/lib/mcpServer";

/**
 * 公開 MCP（/api/mcp）の呼び出し上限と停止スイッチ。
 *
 * 占い文（fortuneGuard）の api_usage は 1 日数回の課金枠で、行を 1 呼び出し
 * ずつ増やす。こちらは毎日何百回も叩かれる計算の入口なので、同じ表には
 * 書かない。代わりに HMAC を主キーにしたトークンバケットを 1 行で更新する。
 * 同じ mcp_public_rate 表を名前空間つきの HMAC で共有し、IP・全体・
 * セッション・道具ごとの上限を 1 トランザクションで検査する。生の IP は残さない。
 *
 * 識別は apiGuard.clientKey（転送ヘッダの末尾。利用者が足した先頭は
 * 信用しない）。DB が落ちている・表がまだ無いときは通すが、外から分かるよう
 * RateLimit-Policy: unavailable と構造化 WARNING ログを出す。プロセス内の
 * 歯止め（requestLimiter）は別にある。
 */

export const MCP_PUBLIC_IP_HOURLY_LIMIT = 2000;
export const MCP_PUBLIC_IP_BURST = 200;
export const MCP_PUBLIC_GLOBAL_HOURLY_LIMIT = 20000;
export const MCP_PUBLIC_GLOBAL_BURST = 1000;
export const MCP_PUBLIC_SESSION_HOURLY_LIMIT = 1000;
export const MCP_PUBLIC_SESSION_BURST = 100;
export const MCP_PUBLIC_TOOL_HOURLY_LIMIT = 5000;
export const MCP_PUBLIC_TOOL_BURST = 300;
export const MCP_PUBLIC_MAX_TOOL_BUCKETS = 8;
export const MCP_PUBLIC_UNKNOWN_TOOL = "unknown";
export const MCP_PUBLIC_ALLOWED_TOOLS: ReadonlySet<string> = new Set<string>(
  MCP_PUBLIC_TOOL_NAMES,
);
export { MCP_PUBLIC_TOOL_NAMES };

const WINDOW_MS = 60 * 60 * 1000;
const DB_TIMEOUT_MS = 1500;
const STALE_MS = 6 * 60 * 60 * 1000;
const MAX_SESSION_ID_LENGTH = 200;
const DISABLED_VALUES = new Set(["false", "0", "off", "no"]);

export type McpLimitScope = "ip" | "global" | "session" | "tool";
export type BucketLimits = { hourly: number; burst: number };

export function mcpPublicEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.MCP_PUBLIC_ENABLED?.trim().toLowerCase();
  return !raw || !DISABLED_VALUES.has(raw);
}

function readLimitPair(
  env: Record<string, string | undefined>,
  hourlyName: string,
  hourlyFallback: number,
  hourlyMax: number,
  burstName: string,
  burstFallback: number,
  burstMax: number,
): BucketLimits {
  const read = (name: string, fallback: number, max: number) => {
    const raw = env[name]?.trim();
    if (!raw || !/^\d+$/.test(raw)) return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : fallback;
  };
  const hourly = read(hourlyName, hourlyFallback, hourlyMax);
  const burst = Math.min(read(burstName, burstFallback, burstMax), hourly);
  return { hourly, burst };
}

export function mcpPublicLimits(
  env: Record<string, string | undefined> = process.env,
): BucketLimits {
  return readLimitPair(
    env,
    "MCP_PUBLIC_IP_HOURLY_LIMIT",
    MCP_PUBLIC_IP_HOURLY_LIMIT,
    100_000,
    "MCP_PUBLIC_IP_BURST",
    MCP_PUBLIC_IP_BURST,
    10_000,
  );
}

export function mcpPublicScopeLimits(
  env: Record<string, string | undefined> = process.env,
): Record<McpLimitScope, BucketLimits> {
  return {
    ip: mcpPublicLimits(env),
    global: readLimitPair(
      env,
      "MCP_PUBLIC_GLOBAL_HOURLY_LIMIT",
      MCP_PUBLIC_GLOBAL_HOURLY_LIMIT,
      1_000_000,
      "MCP_PUBLIC_GLOBAL_BURST",
      MCP_PUBLIC_GLOBAL_BURST,
      100_000,
    ),
    session: readLimitPair(
      env,
      "MCP_PUBLIC_SESSION_HOURLY_LIMIT",
      MCP_PUBLIC_SESSION_HOURLY_LIMIT,
      100_000,
      "MCP_PUBLIC_SESSION_BURST",
      MCP_PUBLIC_SESSION_BURST,
      10_000,
    ),
    tool: readLimitPair(
      env,
      "MCP_PUBLIC_TOOL_HOURLY_LIMIT",
      MCP_PUBLIC_TOOL_HOURLY_LIMIT,
      1_000_000,
      "MCP_PUBLIC_TOOL_BURST",
      MCP_PUBLIC_TOOL_BURST,
      100_000,
    ),
  };
}

export function mcpIpHash(
  ip: string,
  env: Record<string, string | undefined> = process.env,
) {
  const secret = env.API_SECRET_KEY || env.NEXTAUTH_SECRET;
  const mac = secret
    ? createHmac("sha256", secret)
    : createHash("sha256").update("mcp-public-ip-v1:");
  return mac.update(ip).digest("hex");
}

export type McpLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
  scope?: McpLimitScope;
};

export type McpBucketSpec = {
  scope: McpLimitScope;
  key: string;
  limits: BucketLimits;
  isIp?: boolean;
};

type BucketRow = { ipHash: string; tokens: number; updatedAt: Date };

type RateTx = {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  mcpPublicRate: {
    findUnique(args: { where: { ipHash: string } }): Promise<BucketRow | null>;
    upsert(args: {
      where: { ipHash: string };
      create: BucketRow;
      update: { tokens: number; updatedAt: Date };
    }): Promise<unknown>;
    deleteMany(args: { where: { updatedAt: { lt: Date } } }): Promise<unknown>;
  };
};

export type McpRateDb = {
  $transaction<T>(
    fn: (tx: RateTx) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: "ReadCommitted";
    },
  ): Promise<T>;
};

function decision(
  allowed: boolean,
  limits: BucketLimits,
  tokens: number,
): McpLimitDecision {
  const perSecond = limits.hourly / 3600;
  const remaining = allowed ? Math.floor(tokens) : 0;
  const deficit = allowed
    ? Math.max(0, limits.burst - tokens)
    : Math.max(0, 1 - tokens);
  const seconds =
    perSecond > 0
      ? Math.max(allowed ? 0 : 1, Math.ceil(deficit / perSecond))
      : 1;
  return {
    allowed,
    limit: limits.hourly,
    remaining,
    resetSeconds: seconds,
    retryAfterSeconds: allowed ? 0 : seconds,
  };
}

export function extractMcpToolNames(parsedBody: unknown): string[] {
  const items = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
  const known = new Set<string>();
  let hasUnknown = false;
  for (const item of items) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("method" in item) ||
      (item as { method?: unknown }).method !== "tools/call"
    ) {
      continue;
    }
    const params = (item as { params?: unknown }).params;
    if (typeof params !== "object" || params === null || !("name" in params)) {
      hasUnknown = true;
      continue;
    }
    const rawName = (params as { name?: unknown }).name;
    if (typeof rawName !== "string" || !MCP_PUBLIC_ALLOWED_TOOLS.has(rawName)) {
      hasUnknown = true;
      continue;
    }
    if (known.has(rawName)) continue;
    if (known.size < MCP_PUBLIC_MAX_TOOL_BUCKETS) {
      known.add(rawName);
    } else {
      hasUnknown = true;
    }
  }
  const result = [...known];
  if (hasUnknown) result.push(MCP_PUBLIC_UNKNOWN_TOOL);
  return result;
}

export function buildMcpPublicBuckets(
  headers: Headers,
  parsedBody?: unknown,
  env: Record<string, string | undefined> = process.env,
): McpBucketSpec[] {
  const limits = mcpPublicScopeLimits(env);
  const ip = clientKey(headers);
  const buckets: McpBucketSpec[] = [
    { scope: "ip", key: mcpIpHash(ip, env), limits: limits.ip, isIp: true },
    {
      scope: "global",
      key: mcpIpHash("global:v1", env),
      limits: limits.global,
    },
  ];
  const sessionId = headers.get("mcp-session-id")?.trim();
  if (sessionId && sessionId.length <= MAX_SESSION_ID_LENGTH) {
    buckets.push({
      scope: "session",
      key: mcpIpHash(`session:${sessionId}`, env),
      limits: limits.session,
    });
  }
  for (const toolName of extractMcpToolNames(parsedBody)) {
    buckets.push({
      scope: "tool",
      key: mcpIpHash(`tool:${toolName}`, env),
      limits: limits.tool,
    });
  }
  return buckets;
}

export async function consumeMcpPublicBuckets(
  db: McpRateDb,
  buckets: McpBucketSpec[],
  now: Date,
): Promise<McpLimitDecision & { scope: McpLimitScope }> {
  return db.$transaction(
    async (tx) => {
      // デッドロックを防ぐため、鍵の昇順でロックを取る。
      const sortedKeys = [...new Set(buckets.map((b) => b.key))].sort();
      for (const key of sortedKeys) {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`mcp-public:${key}`}, 0))`;
      }
      const states: {
        spec: McpBucketSpec;
        row: BucketRow | null;
        available: number;
      }[] = [];
      for (const spec of buckets) {
        const row = await tx.mcpPublicRate.findUnique({
          where: { ipHash: spec.key },
        });
        const perMs = spec.limits.hourly / WINDOW_MS;
        const elapsed = row
          ? Math.max(0, now.getTime() - row.updatedAt.getTime())
          : 0;
        const available = row
          ? Math.min(spec.limits.burst, row.tokens + elapsed * perMs)
          : spec.limits.burst;
        states.push({ spec, row, available });
      }
      // いずれかが足りない場合は他のバケットを消費せず拒否する。
      for (const state of states) {
        if (state.available < 1) {
          return {
            ...decision(false, state.spec.limits, state.available),
            scope: state.spec.scope,
          };
        }
      }
      const ipState = states.find((s) => s.spec.isIp);
      if (ipState && !ipState.row) {
        await tx.mcpPublicRate.deleteMany({
          where: { updatedAt: { lt: new Date(now.getTime() - STALE_MS) } },
        });
      }
      let mostRestrictive:
        | (McpLimitDecision & { scope: McpLimitScope })
        | null = null;
      for (const state of states) {
        const tokens = state.available - 1;
        await tx.mcpPublicRate.upsert({
          where: { ipHash: state.spec.key },
          create: { ipHash: state.spec.key, tokens, updatedAt: now },
          update: { tokens, updatedAt: now },
        });
        const current = {
          ...decision(true, state.spec.limits, tokens),
          scope: state.spec.scope,
        };
        if (
          !mostRestrictive ||
          current.remaining < mostRestrictive.remaining ||
          (current.remaining === mostRestrictive.remaining &&
            current.limit < mostRestrictive.limit)
        ) {
          mostRestrictive = current;
        }
      }
      return mostRestrictive!;
    },
    { maxWait: 800, timeout: 1400, isolationLevel: "ReadCommitted" },
  );
}

export async function consumeMcpPublicBudget(
  db: McpRateDb,
  ipHash: string,
  now: Date,
  limits = mcpPublicLimits(),
): Promise<McpLimitDecision> {
  return consumeMcpPublicBuckets(
    db,
    [{ scope: "ip", key: ipHash, limits, isIp: true }],
    now,
  );
}

export function rateLimitHeaders(result: McpLimitDecision): Headers {
  const headers = new Headers({
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
    "Cache-Control": "no-store",
  });
  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return headers;
}

export function applyRateHeaders(
  response: Response,
  headers: Headers,
): Response {
  if ([...headers.keys()].length === 0) return response;
  const merged = new Headers(response.headers);
  headers.forEach((value, key) => {
    merged.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export type McpPublicGate = {
  denied: Response | null;
  headers: Headers;
};

function allowGate(): McpPublicGate {
  return {
    denied: null,
    headers: new Headers({
      "RateLimit-Policy": "unavailable",
      "Cache-Control": "no-store",
    }),
  };
}

function failOpenReason(error: unknown): string {
  const code = errorCode(error);
  if (code && /^(P\d{4}|E[A-Z0-9_]{2,30})$/.test(code)) return code;
  if (
    error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) &&
    !/secret|password|token|key/i.test(error.name)
  ) {
    return error.name;
  }
  return "error";
}

function warnRateLimitUnavailable(reason: string): void {
  console.warn(
    JSON.stringify({
      severity: "WARNING",
      message: `[mcp] rate limit unavailable: ${reason}`,
      reason,
    }),
  );
}

export async function checkMcpPublicLimit(
  headers: Headers,
  now = new Date(),
  parsedBody?: unknown,
  db?: McpRateDb,
): Promise<McpPublicGate> {
  const buckets = buildMcpPublicBuckets(headers, parsedBody);
  let settled = false;
  const work = (async (): Promise<
    (McpLimitDecision & { scope: McpLimitScope }) | null
  > => {
    try {
      const client = db ?? (await loadRateDb());
      return await consumeMcpPublicBuckets(client, buckets, now);
    } catch (error) {
      if (!settled) {
        settled = true;
        warnRateLimitUnavailable(failOpenReason(error));
      }
      return null;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        warnRateLimitUnavailable("timeout");
      }
      resolve(null);
    }, DB_TIMEOUT_MS);
  });
  const result = await Promise.race([work, timeout]);
  settled = true;
  if (timer) clearTimeout(timer);
  if (!result) return allowGate();
  const limitHeaders = rateLimitHeaders(result);
  if (result.allowed) return { denied: null, headers: limitHeaders };
  return {
    denied: Response.json(
      { error: "Too many requests", scope: result.scope },
      { status: 429, headers: limitHeaders },
    ),
    headers: limitHeaders,
  };
}

async function loadRateDb(): Promise<McpRateDb> {
  const { default: prisma } = await import("@/lib/prisma");
  return prisma;
}
