import { createHash, createHmac } from "node:crypto";
import { clientKey } from "@/lib/apiGuard";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 公開 MCP（/api/mcp）の、IP ごとの呼び出し上限。
 *
 * 占い文（fortuneGuard）の api_usage は 1 日数回の課金枠で、行を 1 呼び出し
 * ずつ増やす。こちらは毎日何百回も叩かれる計算の入口なので、同じ表には
 * 書かない。代わりに IP の HMAC を主キーにしたトークンバケットを 1 行で
 * 更新する。生の IP は残さない。
 *
 * 識別は apiGuard.clientKey（転送ヘッダの末尾。利用者が足した先頭は
 * 信用しない）。DB が落ちている・表がまだ無いときは通す。プロセス内の
 * 歯止め（requestLimiter）は別にある。
 *
 * 既定はバースト 200、回復 2000 回/時。通常の道具呼び出しでは 429 に
 * ならない量で、環境変数で変えられる。0 や不正な値は既定に戻す
 * （打ち間違いで自分の道具が止まらないように）。
 */

export const MCP_PUBLIC_IP_HOURLY_LIMIT = 2000;
export const MCP_PUBLIC_IP_BURST = 200;
const WINDOW_MS = 60 * 60 * 1000;
const DB_TIMEOUT_MS = 1500;
const STALE_MS = 6 * 60 * 60 * 1000;

export function mcpPublicLimits(
  env: Record<string, string | undefined> = process.env,
) {
  const read = (name: string, fallback: number, max: number) => {
    const raw = env[name]?.trim();
    if (!raw || !/^\d+$/.test(raw)) return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : fallback;
  };
  const hourly = read(
    "MCP_PUBLIC_IP_HOURLY_LIMIT",
    MCP_PUBLIC_IP_HOURLY_LIMIT,
    100_000,
  );
  const burst = Math.min(
    read("MCP_PUBLIC_IP_BURST", MCP_PUBLIC_IP_BURST, 10_000),
    hourly,
  );
  return { hourly, burst };
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
  limits: { hourly: number; burst: number },
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

export async function consumeMcpPublicBudget(
  db: McpRateDb,
  ipHash: string,
  now: Date,
  limits = mcpPublicLimits(),
): Promise<McpLimitDecision> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mcp-public:${ipHash}`}, 0))`;
      const row = await tx.mcpPublicRate.findUnique({ where: { ipHash } });
      const perMs = limits.hourly / WINDOW_MS;
      const elapsed = row
        ? Math.max(0, now.getTime() - row.updatedAt.getTime())
        : 0;
      const available = row
        ? Math.min(limits.burst, row.tokens + elapsed * perMs)
        : limits.burst;
      if (available < 1) return decision(false, limits, available);
      const tokens = available - 1;
      if (!row) {
        await tx.mcpPublicRate.deleteMany({
          where: { updatedAt: { lt: new Date(now.getTime() - STALE_MS) } },
        });
      }
      await tx.mcpPublicRate.upsert({
        where: { ipHash },
        create: { ipHash, tokens, updatedAt: now },
        update: { tokens, updatedAt: now },
      });
      return decision(true, limits, tokens);
    },
    { maxWait: 800, timeout: 1200, isolationLevel: "ReadCommitted" },
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
  return { denied: null, headers: new Headers() };
}

export async function checkMcpPublicLimit(
  headers: Headers,
  now = new Date(),
): Promise<McpPublicGate> {
  const ip = clientKey(headers);
  const ipHash = mcpIpHash(ip);
  const limits = mcpPublicLimits();
  const work = (async (): Promise<McpLimitDecision | null> => {
    try {
      const client = await loadRateDb();
      return await consumeMcpPublicBudget(client, ipHash, now, limits);
    } catch (error) {
      console.error("[mcp] rate limit unavailable:", toLogMessage(error));
      return null;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DB_TIMEOUT_MS);
  });
  const result = await Promise.race([work, timeout]);
  if (timer) clearTimeout(timer);
  if (!result) return allowGate();
  const limitHeaders = rateLimitHeaders(result);
  if (result.allowed) return { denied: null, headers: limitHeaders };
  return {
    denied: Response.json(
      { error: "Too many requests" },
      { status: 429, headers: limitHeaders },
    ),
    headers: limitHeaders,
  };
}

async function loadRateDb(): Promise<McpRateDb> {
  const { default: prisma } = await import("@/lib/prisma");
  return prisma;
}
