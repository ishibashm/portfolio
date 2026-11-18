/**
 * 案内役（/annai）専用の Cloudflare Workers AI 経路。
 *
 * 無料枠（Workers Free）の REST API を fetch で呼ぶ。/ask や Gemini の経路、
 * PAID_APIS_DISABLED とは独立している。プロンプト・応答本文・トークン・
 * アカウントIDはログに出さない。
 */

import { createHmac, randomBytes } from "node:crypto";
import { TokenBucket, clientKey, jstDayKey } from "@/lib/apiGuard";

export const WORKERS_AI_PRIMARY_MODEL = "@cf/zai-org/glm-4.7-flash";
export const WORKERS_AI_FALLBACK_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const WORKERS_AI_TIMEOUT_MS = 15_000;
export const WORKERS_AI_MAX_COMPLETION_TOKENS = 256;
export const WORKERS_AI_DAILY_MAX_CALLS_DEFAULT = 300;
export const WORKERS_AI_MAX_PROMPT_CHARS = 12_000;

const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  WORKERS_AI_PRIMARY_MODEL,
  WORKERS_AI_FALLBACK_MODEL,
]);

const ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i;
const DB_TIMEOUT_MS = 1_500;

type Env = Record<string, string | undefined>;

export type WorkersAiGuideState =
  | { enabled: true; accountId: string; token: string }
  | { enabled: false; reason: string };

/** 4条件がそろったときだけ有効。PAID_APIS_DISABLED は見ない。 */
export function workersAiGuideState(env: Env): WorkersAiGuideState {
  if (env.GUIDE_AI_ENABLED !== "true") {
    return { enabled: false, reason: "guide_ai_disabled" };
  }
  if (env.GUIDE_AI_PROVIDER?.trim() !== "workers-ai") {
    return { enabled: false, reason: "provider_not_workers_ai" };
  }
  const accountId = env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID?.trim() ?? "";
  if (!ACCOUNT_ID_RE.test(accountId)) {
    return { enabled: false, reason: "account_id_invalid" };
  }
  const token = env.CLOUDFLARE_WORKERS_AI_TOKEN?.trim() ?? "";
  if (!token) {
    return { enabled: false, reason: "token_missing" };
  }
  return { enabled: true, accountId, token };
}

/** GUIDE_AI_DAILY_MAX_CALLS。未設定は 300、不正値は 0（呼ばない）。 */
export function workersAiDailyCap(env: Env): number {
  const raw = env.GUIDE_AI_DAILY_MAX_CALLS?.trim();
  if (raw === undefined || raw === "")
    return WORKERS_AI_DAILY_MAX_CALLS_DEFAULT;
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export type WorkersAiChatResult = {
  text: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

type WorkersAiEnvelope = {
  success?: boolean;
  errors?: { code?: unknown }[];
  result?: {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
};

function errorCodes(body: WorkersAiEnvelope | null): string {
  const codes = (body?.errors ?? [])
    .map((e) => (typeof e?.code === "number" ? e.code : null))
    .filter((c): c is number => c !== null);
  return codes.length > 0 ? ` codes=${codes.join(",")}` : "";
}

/** Workers AI のチャットを1回呼ぶ。失敗時の Error には HTTP ステータスとエラーコードだけを入れる。 */
export async function callWorkersAiChat(input: {
  accountId: string;
  token: string;
  model: string;
  system: string;
  prompt: string;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}): Promise<WorkersAiChatResult> {
  if (!ALLOWED_MODELS.has(input.model)) {
    throw new Error("workers_ai_model_not_allowed");
  }
  if (!ACCOUNT_ID_RE.test(input.accountId)) {
    throw new Error("workers_ai_account_invalid");
  }
  const fetchFn = input.fetchFn ?? fetch;
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt },
    ],
    max_completion_tokens: WORKERS_AI_MAX_COMPLETION_TOKENS,
    temperature: 0.2,
  };
  if (input.model === WORKERS_AI_PRIMARY_MODEL) {
    // 思考で出力枠を使い切らないようにする
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const response = await fetchFn(
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${input.model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    },
  );

  let parsed: WorkersAiEnvelope | null = null;
  try {
    parsed = (await response.json()) as WorkersAiEnvelope;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`workers_ai_http_${response.status}${errorCodes(parsed)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`workers_ai_invalid_json status=${response.status}`);
  }
  if (parsed.success === false) {
    throw new Error(
      `workers_ai_unsuccessful status=${response.status}${errorCodes(parsed)}`,
    );
  }

  const result = parsed.result;
  const content = result?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string" && content.trim()
      ? content
      : typeof result?.response === "string"
        ? result.response
        : "";
  if (!text.trim()) {
    throw new Error(`workers_ai_empty status=${response.status}`);
  }

  const promptTokens = result?.usage?.prompt_tokens;
  const completionTokens = result?.usage?.completion_tokens;
  return {
    text,
    model: input.model,
    promptTokens: typeof promptTokens === "number" ? promptTokens : undefined,
    completionTokens:
      typeof completionTokens === "number" ? completionTokens : undefined,
  };
}

// ---------------------------------------------------------------------------
// 1日の上限（全インスタンス共通。agent_usage_daily の案内役専用行）

const wsGlobal = globalThis as typeof globalThis & {
  mcpAgentSalt?: Buffer;
  guideWorkersAiMemory?: { day: string; count: number };
  guideWorkersAiBucket?: TokenBucket;
};

/** agentEntitlement.ts の subjectHmacKey と同じ決め方（同ファイルは変えない）。 */
function guideSubjectHmacKey(env: Env): string | Buffer {
  const secret = env.API_SECRET_KEY?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (secret) return `agent-subject-v1:${secret}`;
  return (wsGlobal.mcpAgentSalt ??= randomBytes(32));
}

export function guideWorkersAiSubjectHash(env: Env = process.env): string {
  return createHmac("sha256", guideSubjectHmacKey(env))
    .update("guide-workers-ai-v1")
    .digest("hex");
}

export type GuideUsageDb = {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("db_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function reserveInMemory(day: string, cap: number): boolean {
  const limit = Math.floor(cap / 2);
  const mem = wsGlobal.guideWorkersAiMemory;
  if (!mem || mem.day !== day) {
    wsGlobal.guideWorkersAiMemory = { day, count: 0 };
  }
  const current = wsGlobal.guideWorkersAiMemory!;
  if (current.count >= limit) return false;
  current.count++;
  return true;
}

/** テスト用: プロセス内の予備カウンタと IP バケツを消す。 */
export function resetWorkersAiGuideMemory(): void {
  wsGlobal.guideWorkersAiMemory = undefined;
  wsGlobal.guideWorkersAiBucket = undefined;
}

/**
 * 1回分を予約する。DB の行を +1 して cap を超えたら false。
 * DB が使えない・1.5 秒で返らないときは、プロセス内で floor(cap/2) まで。
 */
export async function reserveWorkersAiCall(input: {
  at: number;
  cap: number;
  db?: GuideUsageDb;
  env?: Env;
}): Promise<boolean> {
  const { at, cap } = input;
  if (!Number.isSafeInteger(cap) || cap <= 0) return false;
  const day = jstDayKey(at);
  const hash = guideWorkersAiSubjectHash(input.env ?? process.env);
  try {
    const run = async () => {
      const db =
        input.db ??
        ((await import("@/lib/prisma")).default as unknown as GuideUsageDb);
      return db.$queryRaw<{ requests: unknown }[]>`
        INSERT INTO agent_usage_daily (
          day, subject_hash, requests, tokens, cost_usd, updated_at
        )
        VALUES (${day}::date, ${hash}, 1, 0, 0, now())
        ON CONFLICT (day, subject_hash) DO UPDATE
        SET requests = agent_usage_daily.requests + 1,
            updated_at = now()
        RETURNING requests
      `;
    };
    const rows = await withTimeout(run(), DB_TIMEOUT_MS);
    const requests = Number(Array.isArray(rows) ? rows[0]?.requests : NaN);
    if (!Number.isFinite(requests)) throw new Error("invalid_rows");
    return requests <= cap;
  } catch {
    return reserveInMemory(day, cap);
  }
}

/** IP ごとの上限: 容量 3、20 秒に 1 回復。 */
export function takeWorkersAiIpToken(headers: Headers, at: number): boolean {
  const bucket = (wsGlobal.guideWorkersAiBucket ??= new TokenBucket(
    3,
    1 / 20_000,
  ));
  return bucket.take(clientKey(headers), at);
}

// ---------------------------------------------------------------------------
// 生年月日の除去

const BIRTH_KEY_RE = /birth|生年|dob/i;

function collectBirthStrings(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectBirthStrings(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BIRTH_KEY_RE.test(k)) {
        collectAllStrings(v, out);
      } else {
        collectBirthStrings(v, out);
      }
    }
  }
}

function collectAllStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (value.trim()) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectAllStrings(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectAllStrings(v, out);
    }
  }
}

function stripBirth(value: unknown, secrets: ReadonlySet<string>): unknown {
  if (typeof value === "string") {
    return secrets.has(value) ? "[省略]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripBirth(v, secrets));
  }
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BIRTH_KEY_RE.test(k)) continue;
      copy[k] = stripBirth(v, secrets);
    }
    return copy;
  }
  return value;
}

/** 生年月日らしいキーを消し、その値と完全一致する文字列を "[省略]" にした複製を返す。 */
export function redactBirthData(outputs: unknown[]): unknown[] {
  const secrets = new Set<string>();
  collectBirthStrings(outputs, secrets);
  return outputs.map((o) => stripBirth(o, secrets));
}
