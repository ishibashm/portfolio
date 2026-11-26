/**
 * 案内役（/annai・/annai/ask）の Workers AI ニューロン・質問回数台帳。
 *
 * Cloudflare Workers AI の無料枠（10,000 neurons/day）は UTC 00:00 にリセット
 * されるため、この台帳の日付は jstDayKey ではなく UTC 日（toISOString().slice(0,10)）
 * で切る。保存先は既存の agent_usage_daily 表を再利用し、新しい DDL は足さない。
 */

import { TokenBucket, clientKey } from "@/lib/apiGuard";
import { guideLedgerHash, type GuideUsageDb } from "./workersAi";

export const GUIDE_NEURON_STOP = 9000;
export const GUIDE_NEURON_WARN = 6300;
export const GUIDE_QUESTION_RESERVE_NEURONS = 260;
export const GUIDE_SUMMARY_RESERVE_NEURONS = 60;
export const GUIDE_GLOBAL_DAILY_QUESTIONS = 45;
export const GUIDE_GLOBAL_HOURLY_QUESTIONS = 12;
export const GUIDE_PERSON_DAILY_QUESTIONS = 8;
export const GUIDE_PERSON_PER_MINUTE = 3;

const DB_TIMEOUT_MS = 1_500;
const MILLI_PER_NEURON = 1_000;

type Env = Record<string, string | undefined>;

export type NeuronTicket = {
  day: string;
  subjectHash: string;
  reservedNeurons: number;
  reservedMilli: number;
  inMemory?: boolean;
  settled?: boolean;
};

export type FreeQuestionRejectReason =
  | "rate_minute"
  | "person_daily"
  | "busy"
  | "global_daily"
  | "hourly"
  | "neurons_stop";

export type AdmitFreeQuestionResult =
  | { ok: true; ticket: NeuronTicket }
  | { ok: false; reason: FreeQuestionRejectReason };

/** UTC 00:00 基準の日付キー（YYYY-MM-DD）。 */
export function utcDayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** UTC 時間キー（YYYY-MM-DDTHH）。 */
export function utcHourKey(at: number): string {
  return new Date(at).toISOString().slice(0, 13);
}

type BudgetMemoryState = {
  day: string;
  requests: Map<string, number>;
  neuronMilli: number;
};

const budgetGlobal = globalThis as typeof globalThis & {
  guideBudgetMinuteBucket?: TokenBucket;
  guideBudgetMemory?: BudgetMemoryState;
};

function getMemoryState(day: string): BudgetMemoryState {
  const cur = budgetGlobal.guideBudgetMemory;
  if (!cur || cur.day !== day) {
    const fresh: BudgetMemoryState = {
      day,
      requests: new Map<string, number>(),
      neuronMilli: 0,
    };
    budgetGlobal.guideBudgetMemory = fresh;
    return fresh;
  }
  return cur;
}

/** テスト用: プロセス内のトークンバケツと予備台帳を初期化する。 */
export function resetGuideBudgetMemory(): void {
  budgetGlobal.guideBudgetMinuteBucket = undefined;
  budgetGlobal.guideBudgetMemory = undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("db_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolveDb(db?: GuideUsageDb): Promise<GuideUsageDb> {
  if (db) return db;
  return (await import("@/lib/prisma")).default as unknown as GuideUsageDb;
}

function reserveRequestsInMemory(
  day: string,
  hash: string,
  limit: number,
  enforce: boolean,
): boolean {
  const halfLimit = Math.floor(limit / 2);
  const mem = getMemoryState(day);
  const current = mem.requests.get(hash) ?? 0;
  if (enforce && current >= halfLimit) return false;
  mem.requests.set(hash, current + 1);
  return true;
}

function reserveNeuronsInMemory(
  day: string,
  reserveMilli: number,
  limitMilli: number,
): boolean {
  const halfLimitMilli = Math.floor(limitMilli / 2);
  const mem = getMemoryState(day);
  if (mem.neuronMilli + reserveMilli > halfLimitMilli) return false;
  mem.neuronMilli += reserveMilli;
  return true;
}

/**
 * agent_usage_daily の requests を条件付きで +1 する。
 * enforce=true のときは requests < limit の行のみ更新し、行が返らなければ上限超過。
 * enforce=false（継続会話の時間枠）は上限で止めずに加算だけ行う。
 */
async function tryIncrementRequests(input: {
  day: string;
  hash: string;
  limit: number;
  enforce: boolean;
  db?: GuideUsageDb;
}): Promise<boolean> {
  const { day, hash, limit, enforce } = input;
  if (enforce && limit <= 0) return false;
  try {
    const run = async () => {
      const db = await resolveDb(input.db);
      if (enforce) {
        return db.$queryRaw<{ requests?: unknown }[]>`
          INSERT INTO agent_usage_daily (
            day, subject_hash, requests, tokens, cost_usd, updated_at
          )
          VALUES (${day}::date, ${hash}, 1, 0, 0, now())
          ON CONFLICT (day, subject_hash) DO UPDATE
          SET requests = agent_usage_daily.requests + 1,
              updated_at = now()
          WHERE agent_usage_daily.requests < ${limit}
          RETURNING requests
        `;
      }
      return db.$queryRaw<{ requests?: unknown }[]>`
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
    if (!Array.isArray(rows)) throw new Error("invalid_rows");
    if (rows.length === 0) return false;
    if (enforce && rows[0]?.requests !== undefined) {
      const requests = Number(rows[0].requests);
      if (!Number.isFinite(requests)) throw new Error("invalid_rows");
      return requests <= limit;
    }
    return true;
  } catch {
    return reserveRequestsInMemory(day, hash, limit, enforce);
  }
}

/**
 * agent_usage_daily の tokens（ミリニューロン）を条件付きで予約する。
 * INSERT 経路・UPDATE 経路とも tokens + reserveMilli <= limitMilli を守る。
 */
async function tryReserveNeurons(input: {
  day: string;
  hash: string;
  reserveNeurons: number;
  limitNeurons: number;
  db?: GuideUsageDb;
}): Promise<NeuronTicket | null> {
  const { day, hash, reserveNeurons, limitNeurons } = input;
  const reserveMilli = Math.max(
    0,
    Math.round(reserveNeurons * MILLI_PER_NEURON),
  );
  const limitMilli = Math.max(0, Math.round(limitNeurons * MILLI_PER_NEURON));
  if (reserveMilli > limitMilli || limitMilli <= 0) return null;

  try {
    const run = async () => {
      const db = await resolveDb(input.db);
      return db.$queryRaw<{ tokens?: unknown }[]>`
        INSERT INTO agent_usage_daily (
          day, subject_hash, requests, tokens, cost_usd, updated_at
        )
        SELECT ${day}::date, ${hash}, 1, ${reserveMilli}, 0, now()
        WHERE ${reserveMilli} <= ${limitMilli}
        ON CONFLICT (day, subject_hash) DO UPDATE
        SET requests = agent_usage_daily.requests + 1,
            tokens = agent_usage_daily.tokens + ${reserveMilli},
            updated_at = now()
        WHERE agent_usage_daily.tokens + ${reserveMilli} <= ${limitMilli}
        RETURNING tokens
      `;
    };
    const rows = await withTimeout(run(), DB_TIMEOUT_MS);
    if (!Array.isArray(rows)) throw new Error("invalid_rows");
    if (rows.length === 0) return null;
    if (rows[0]?.tokens !== undefined) {
      const tokens = Number(rows[0].tokens);
      if (!Number.isFinite(tokens)) throw new Error("invalid_rows");
      if (tokens > limitMilli) return null;
    }
    return {
      day,
      subjectHash: hash,
      reservedNeurons: reserveNeurons,
      reservedMilli: reserveMilli,
    };
  } catch {
    const ok = reserveNeuronsInMemory(day, reserveMilli, limitMilli);
    if (!ok) return null;
    return {
      day,
      subjectHash: hash,
      reservedNeurons: reserveNeurons,
      reservedMilli: reserveMilli,
      inMemory: true,
    };
  }
}

/**
 * 自由質問の受付検査とニューロン予約。
 * 順序: 分あたりTokenBucket(3/分) → 個人日次(<8) → 全体日次(<45) →
 * 時間枠(<12、新規会話のみ制限・継続会話も加算) → ニューロン予約(260、新規6300/継続9000)。
 */
export async function admitFreeQuestion(input: {
  at: number;
  headers: Headers;
  isNewConversation: boolean;
  db?: GuideUsageDb;
  env?: Env;
}): Promise<AdmitFreeQuestionResult> {
  const { at, headers, isNewConversation, db } = input;
  const env = input.env ?? process.env;
  const client = clientKey(headers);

  // 1. 1分あたり3回のトークンバケツ（メモリ）
  const bucket = (budgetGlobal.guideBudgetMinuteBucket ??= new TokenBucket(
    GUIDE_PERSON_PER_MINUTE,
    GUIDE_PERSON_PER_MINUTE / 60_000,
  ));
  if (!bucket.take(client, at)) {
    return { ok: false, reason: "rate_minute" };
  }

  const day = utcDayKey(at);
  const hour = utcHourKey(at);

  // 2. 個人あたり1日8問（HMACのみ保存、IPは保存しない）
  const personHash = guideLedgerHash(`guide-person-v1:${client}`, env);
  const personOk = await tryIncrementRequests({
    day,
    hash: personHash,
    limit: GUIDE_PERSON_DAILY_QUESTIONS,
    enforce: true,
    db,
  });
  if (!personOk) {
    return { ok: false, reason: "person_daily" };
  }

  // 3. サイト全体で1日45問
  const globalQuestionsHash = guideLedgerHash("guide-questions-v1", env);
  const globalOk = await tryIncrementRequests({
    day,
    hash: globalQuestionsHash,
    limit: GUIDE_GLOBAL_DAILY_QUESTIONS,
    enforce: true,
    db,
  });
  if (!globalOk) {
    return { ok: false, reason: "global_daily" };
  }

  // 4. サイト全体で1時間12問（新規会話のみ制限、継続会話も加算）
  const hourHash = guideLedgerHash(`guide-hour-v1:${hour}`, env);
  const hourOk = await tryIncrementRequests({
    day,
    hash: hourHash,
    limit: GUIDE_GLOBAL_HOURLY_QUESTIONS,
    enforce: isNewConversation,
    db,
  });
  if (!hourOk) {
    return { ok: false, reason: "hourly" };
  }

  // 5. ニューロン予約（新規は6,300でbusy、継続は9,000でneurons_stop）
  const neuronsHash = guideLedgerHash("guide-neurons-v1", env);
  const limitNeurons = isNewConversation
    ? GUIDE_NEURON_WARN
    : GUIDE_NEURON_STOP;
  const ticket = await tryReserveNeurons({
    day,
    hash: neuronsHash,
    reserveNeurons: GUIDE_QUESTION_RESERVE_NEURONS,
    limitNeurons,
    db,
  });
  if (!ticket) {
    return {
      ok: false,
      reason: isNewConversation ? "busy" : "neurons_stop",
    };
  }

  return { ok: true, ticket };
}

/** 定型フローのAI要約用に 60 ニューロンを上限 9,000 で予約する。 */
export async function admitSummary(input: {
  at: number;
  db?: GuideUsageDb;
  env?: Env;
}): Promise<NeuronTicket | null> {
  const env = input.env ?? process.env;
  const day = utcDayKey(input.at);
  const hash = guideLedgerHash("guide-neurons-v1", env);
  return tryReserveNeurons({
    day,
    hash,
    reserveNeurons: GUIDE_SUMMARY_RESERVE_NEURONS,
    limitNeurons: GUIDE_NEURON_STOP,
    db: input.db,
  });
}

/**
 * 予約したニューロンを実測値で精算する（actual - reserved をミリニューロンで加算）。
 * 実測値が不明なときは予約値（ticket.reservedNeurons）を渡せば増減0になる。
 */
export async function settleNeurons(
  ticket: NeuronTicket,
  actualNeurons: number,
  db?: GuideUsageDb,
): Promise<void> {
  if (ticket.settled) return;
  ticket.settled = true;

  if (typeof actualNeurons !== "number" || !Number.isFinite(actualNeurons)) {
    return;
  }
  const actualMilli = Math.max(0, Math.round(actualNeurons * MILLI_PER_NEURON));
  const delta = actualMilli - ticket.reservedMilli;
  if (delta === 0) return;

  if (ticket.inMemory) {
    const mem = getMemoryState(ticket.day);
    mem.neuronMilli = Math.max(0, mem.neuronMilli + delta);
    return;
  }

  try {
    const run = async () => {
      const resolved = await resolveDb(db);
      return resolved.$queryRaw<{ tokens?: unknown }[]>`
        UPDATE agent_usage_daily
        SET tokens = GREATEST(0, agent_usage_daily.tokens + ${delta}),
            updated_at = now()
        WHERE day = ${ticket.day}::date AND subject_hash = ${ticket.subjectHash}
        RETURNING tokens
      `;
    };
    await withTimeout(run(), DB_TIMEOUT_MS);
  } catch {
    const mem = getMemoryState(ticket.day);
    mem.neuronMilli = Math.max(0, mem.neuronMilli + delta);
  }
}

/** 当日（UTC）の使用済みニューロン数を返す（表示・テスト用）。 */
export async function neuronUsage(input: {
  at: number;
  db?: GuideUsageDb;
  env?: Env;
}): Promise<number> {
  const env = input.env ?? process.env;
  const day = utcDayKey(input.at);
  const hash = guideLedgerHash("guide-neurons-v1", env);
  try {
    const run = async () => {
      const db = await resolveDb(input.db);
      return db.$queryRaw<{ tokens?: unknown }[]>`
        SELECT tokens
        FROM agent_usage_daily
        WHERE day = ${day}::date AND subject_hash = ${hash}
      `;
    };
    const rows = await withTimeout(run(), DB_TIMEOUT_MS);
    if (!Array.isArray(rows)) throw new Error("invalid_rows");
    if (rows.length === 0) return 0;
    const tokens = Number(rows[0]?.tokens ?? 0);
    if (!Number.isFinite(tokens)) throw new Error("invalid_rows");
    return tokens / MILLI_PER_NEURON;
  } catch {
    const mem = budgetGlobal.guideBudgetMemory;
    if (!mem || mem.day !== day) return 0;
    return mem.neuronMilli / MILLI_PER_NEURON;
  }
}
