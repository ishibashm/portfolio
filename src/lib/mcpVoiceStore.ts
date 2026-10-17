import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { jstDayKey } from "./apiGuard";

const GLOBAL_SUBJECT = "global";

export type VoiceStoreErrorKind =
  | "duplicate"
  | "forbidden"
  | "tool_limit"
  | "unavailable";

export class VoiceStoreError extends Error {
  constructor(readonly kind: VoiceStoreErrorKind) {
    super(kind);
  }
}

export interface VoiceStoredSession {
  createdAt: number;
  expiresAt: number;
  reservedSeconds: number;
  toolCallCount: number;
}

export interface VoiceStore {
  sweepExpired(): Promise<void>;
  reserveSession(input: {
    sessionHash: string;
    userSubject: string;
    model: string;
    maxSessionSeconds: number;
    userDailySeconds: number;
    globalDailySeconds: number;
  }): Promise<VoiceStoredSession | null>;
  settleSession(input: {
    sessionHash: string;
    userSubject: string;
    reportedSeconds: number;
  }): Promise<{ actualSeconds: number; toolCallCount: number }>;
  claimTool(input: {
    sessionHash: string;
    userSubject: string;
    callId: string;
    maxToolCalls: number;
  }): Promise<VoiceStoredSession>;
  assertActive(input: {
    sessionHash: string;
    userSubject: string;
  }): Promise<void>;
}

type SessionRow = {
  user_subject: string;
  day: string;
  created_at: Date;
  expires_at: Date;
  reserved_seconds: number;
  actual_seconds: number | null;
  tool_call_count: number;
  ended: boolean;
  server_now?: Date;
  /** Prisma 経路だけ。DB の時刻は epoch ミリ秒と真偽で受け取る（下記）。 */
  created_ms?: number;
  expires_ms?: number;
  expired?: boolean;
};

// timestamptz を Date で受け取ると、DB セッションの TimeZone が UTC 以外のとき
// adapter-pg が時差ぶんずれた値を返す（Asia/Tokyo の Postgres で 9 時間ずれを実測）。
// 期限の判定は SQL の中で行い、アプリへは epoch ミリ秒だけを渡す。
const SESSION_COLUMNS = Prisma.sql`user_subject, day, created_at, expires_at,
  reserved_seconds, actual_seconds, tool_call_count, ended,
  (EXTRACT(EPOCH FROM created_at) * 1000)::double precision AS created_ms,
  (EXTRACT(EPOCH FROM expires_at) * 1000)::double precision AS expires_ms,
  (expires_at <= CURRENT_TIMESTAMP) AS expired`;

function unavailable(error: unknown): never {
  if (error instanceof VoiceStoreError) throw error;
  throw new VoiceStoreError("unavailable");
}

function stored(row: SessionRow): VoiceStoredSession {
  return {
    createdAt: Number(row.created_ms ?? row.created_at.getTime()),
    expiresAt: Number(row.expires_ms ?? row.expires_at.getTime()),
    reservedSeconds: row.reserved_seconds,
    toolCallCount: row.tool_call_count,
  };
}

/** Cloud Run の全インスタンスで共有する音声台帳。DB 失敗時は常に閉じる。 */
export class PrismaVoiceStore implements VoiceStore {
  async sweepExpired() {
    try {
      await prisma.$executeRaw`
        UPDATE voice_sessions
        SET ended = TRUE, actual_seconds = reserved_seconds
        WHERE ended = FALSE AND expires_at <= CURRENT_TIMESTAMP
      `;
    } catch (error) {
      unavailable(error);
    }
  }

  async reserveSession(input: {
    sessionHash: string;
    userSubject: string;
    model: string;
    maxSessionSeconds: number;
    userDailySeconds: number;
    globalDailySeconds: number;
  }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const clock = await tx.$queryRaw<{ now: Date; day: string }[]>`
          SELECT CURRENT_TIMESTAMP AS now,
                 (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date::text AS day
        `;
        const current = clock[0];
        if (!current) throw new VoiceStoreError("unavailable");
        // pg_advisory_xact_lock は void を返すので、$queryRaw では列を読めない。
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`mcp_voice:${current.day}`}))
        `;
        const totals = await tx.$queryRaw<
          { subject_hash: string; seconds: number }[]
        >`
          -- CHAR(64) は短い値（global）を空白で埋めて返す。text へ変換して
          -- 末尾の空白を落とさないと、全体の使用量が Map で引けず 0 に見える。
          SELECT subject_hash::text AS subject_hash, seconds
          FROM voice_usage_ledgers
          WHERE day = ${current.day}
            AND subject_hash IN (${GLOBAL_SUBJECT}, ${input.userSubject})
        `;
        const used = new Map(
          totals.map((row) => [row.subject_hash, Number(row.seconds)]),
        );
        const seconds = Math.min(
          input.maxSessionSeconds,
          input.globalDailySeconds - (used.get(GLOBAL_SUBJECT) ?? 0),
          input.userDailySeconds - (used.get(input.userSubject) ?? 0),
        );
        if (seconds < 1) return null;
        for (const subject of [GLOBAL_SUBJECT, input.userSubject])
          await tx.$executeRaw`
            INSERT INTO voice_usage_ledgers (day, subject_hash, seconds, updated_at)
            VALUES (${current.day}, ${subject}, ${seconds}, CURRENT_TIMESTAMP)
            ON CONFLICT (day, subject_hash) DO UPDATE
            SET seconds = voice_usage_ledgers.seconds + EXCLUDED.seconds,
                updated_at = CURRENT_TIMESTAMP
          `;
        const rows = await tx.$queryRaw<SessionRow[]>`
          INSERT INTO voice_sessions (
            session_hash, user_subject, day, created_at, expires_at,
            reserved_seconds, actual_seconds, tool_call_count, ended, model
          ) VALUES (
            ${input.sessionHash}, ${input.userSubject}, ${current.day},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP + (${seconds}::double precision * INTERVAL '1 second'),
            ${seconds}, NULL, 0, FALSE, ${input.model}
          )
          RETURNING ${SESSION_COLUMNS}
        `;
        if (!rows[0]) throw new VoiceStoreError("unavailable");
        return stored(rows[0]);
      });
    } catch (error) {
      unavailable(error);
    }
  }

  async settleSession(input: {
    sessionHash: string;
    userSubject: string;
    reportedSeconds: number;
  }) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<SessionRow[]>`
          SELECT ${SESSION_COLUMNS}
          FROM voice_sessions
          WHERE session_hash = ${input.sessionHash}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row || row.user_subject !== input.userSubject)
          return { state: "forbidden" as const };
        if (row.ended)
          return {
            state: "ok" as const,
            actualSeconds: Number(row.actual_seconds ?? row.reserved_seconds),
            toolCallCount: row.tool_call_count,
          };
        if (row.expired) {
          await tx.$executeRaw`
            UPDATE voice_sessions
            SET ended = TRUE, actual_seconds = reserved_seconds
            WHERE session_hash = ${input.sessionHash}
          `;
          return {
            state: "ok" as const,
            actualSeconds: row.reserved_seconds,
            toolCallCount: row.tool_call_count,
          };
        }
        // 経過秒数は DB の時刻だけで測る（created_at を往復させない）。
        const actualRows = await tx.$queryRaw<{ actual: number }[]>`
          SELECT LEAST(
            reserved_seconds,
            GREATEST(${input.reportedSeconds}::double precision, 0),
            GREATEST(
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::double precision,
              0
            )
          )::double precision AS actual
          FROM voice_sessions
          WHERE session_hash = ${input.sessionHash}
        `;
        const actual = Number(actualRows[0]?.actual ?? 0);
        await tx.$executeRaw`
          UPDATE voice_sessions
          SET ended = TRUE, actual_seconds = ${actual}
          WHERE session_hash = ${input.sessionHash}
        `;
        const adjustment = actual - row.reserved_seconds;
        for (const subject of [GLOBAL_SUBJECT, input.userSubject])
          await tx.$executeRaw`
            UPDATE voice_usage_ledgers
            SET seconds = GREATEST(0, seconds + ${adjustment}),
                updated_at = CURRENT_TIMESTAMP
            WHERE day = ${row.day} AND subject_hash = ${subject}
          `;
        return {
          state: "ok" as const,
          actualSeconds: actual,
          toolCallCount: row.tool_call_count,
        };
      });
      if (result.state === "forbidden") throw new VoiceStoreError("forbidden");
      return result;
    } catch (error) {
      unavailable(error);
    }
  }

  async claimTool(input: {
    sessionHash: string;
    userSubject: string;
    callId: string;
    maxToolCalls: number;
  }) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<SessionRow[]>`
          SELECT ${SESSION_COLUMNS}
          FROM voice_sessions
          WHERE session_hash = ${input.sessionHash}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row || row.user_subject !== input.userSubject)
          return { state: "forbidden" as const };
        if (row.ended || row.expired) {
          if (!row.ended)
            await tx.$executeRaw`
              UPDATE voice_sessions
              SET ended = TRUE, actual_seconds = reserved_seconds
              WHERE session_hash = ${input.sessionHash}
            `;
          return { state: "forbidden" as const };
        }
        if (row.tool_call_count >= input.maxToolCalls)
          return { state: "tool_limit" as const };
        const duplicate = await tx.$queryRaw<{ found: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM voice_tool_calls
            WHERE session_hash = ${input.sessionHash} AND call_id = ${input.callId}
          ) AS found
        `;
        if (duplicate[0]?.found) return { state: "duplicate" as const };
        await tx.$executeRaw`
          INSERT INTO voice_tool_calls (session_hash, call_id, created_at)
          VALUES (${input.sessionHash}, ${input.callId}, CURRENT_TIMESTAMP)
        `;
        const updated = await tx.$queryRaw<SessionRow[]>`
          UPDATE voice_sessions
          SET tool_call_count = tool_call_count + 1
          WHERE session_hash = ${input.sessionHash}
          RETURNING ${SESSION_COLUMNS}
        `;
        return { state: "ok" as const, session: stored(updated[0]) };
      });
      if (result.state !== "ok") throw new VoiceStoreError(result.state);
      return result.session;
    } catch (error) {
      unavailable(error);
    }
  }

  async assertActive(input: { sessionHash: string; userSubject: string }) {
    try {
      const rows = await prisma.$queryRaw<{ active: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM voice_sessions
          WHERE session_hash = ${input.sessionHash}
            AND user_subject = ${input.userSubject}
            AND ended = FALSE
            AND expires_at > CURRENT_TIMESTAMP
        ) AS active
      `;
      if (!rows[0]?.active) throw new VoiceStoreError("forbidden");
    } catch (error) {
      unavailable(error);
    }
  }
}

type MemorySession = SessionRow & { calls: Set<string> };

/** Unit-test store with the same atomic boundaries as the Prisma implementation. */
export class MemoryVoiceStore implements VoiceStore {
  private readonly usage = new Map<string, Map<string, number>>();
  private readonly sessions = new Map<string, MemorySession>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  voiceDaily(at: number, subject = GLOBAL_SUBJECT) {
    return this.usage.get(jstDayKey(at))?.get(subject) ?? 0;
  }

  async sweepExpired() {
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (!session.ended && session.expires_at.getTime() <= now) {
        session.ended = true;
        session.actual_seconds = session.reserved_seconds;
      }
    }
  }

  async reserveSession(input: {
    sessionHash: string;
    userSubject: string;
    model: string;
    maxSessionSeconds: number;
    userDailySeconds: number;
    globalDailySeconds: number;
  }) {
    const now = this.now();
    const day = jstDayKey(now);
    const totals = this.usage.get(day) ?? new Map<string, number>();
    this.usage.set(day, totals);
    const seconds = Math.min(
      input.maxSessionSeconds,
      input.globalDailySeconds - (totals.get(GLOBAL_SUBJECT) ?? 0),
      input.userDailySeconds - (totals.get(input.userSubject) ?? 0),
    );
    if (seconds < 1) return null;
    for (const subject of [GLOBAL_SUBJECT, input.userSubject])
      totals.set(subject, (totals.get(subject) ?? 0) + seconds);
    const row: MemorySession = {
      user_subject: input.userSubject,
      day,
      created_at: new Date(now),
      expires_at: new Date(now + seconds * 1000),
      reserved_seconds: seconds,
      actual_seconds: null,
      tool_call_count: 0,
      ended: false,
      calls: new Set(),
    };
    this.sessions.set(input.sessionHash, row);
    return stored(row);
  }

  async settleSession(input: {
    sessionHash: string;
    userSubject: string;
    reportedSeconds: number;
  }) {
    const row = this.owned(input.sessionHash, input.userSubject);
    if (row.ended)
      return {
        actualSeconds: row.actual_seconds ?? row.reserved_seconds,
        toolCallCount: row.tool_call_count,
      };
    if (row.expires_at.getTime() <= this.now()) {
      row.ended = true;
      row.actual_seconds = row.reserved_seconds;
      return {
        actualSeconds: row.reserved_seconds,
        toolCallCount: row.tool_call_count,
      };
    }
    const actual = Math.min(
      row.reserved_seconds,
      Math.max(input.reportedSeconds, 0),
      Math.max((this.now() - row.created_at.getTime()) / 1000, 0),
    );
    row.ended = true;
    row.actual_seconds = actual;
    const totals = this.usage.get(row.day)!;
    for (const subject of [GLOBAL_SUBJECT, input.userSubject])
      totals.set(
        subject,
        Math.max(0, (totals.get(subject) ?? 0) - row.reserved_seconds + actual),
      );
    return { actualSeconds: actual, toolCallCount: row.tool_call_count };
  }

  async claimTool(input: {
    sessionHash: string;
    userSubject: string;
    callId: string;
    maxToolCalls: number;
  }) {
    const row = this.owned(input.sessionHash, input.userSubject);
    if (row.ended || row.expires_at.getTime() <= this.now()) {
      if (!row.ended) {
        row.ended = true;
        row.actual_seconds = row.reserved_seconds;
      }
      throw new VoiceStoreError("forbidden");
    }
    if (row.tool_call_count >= input.maxToolCalls)
      throw new VoiceStoreError("tool_limit");
    if (row.calls.has(input.callId)) throw new VoiceStoreError("duplicate");
    row.calls.add(input.callId);
    row.tool_call_count++;
    return stored(row);
  }

  async assertActive(input: { sessionHash: string; userSubject: string }) {
    const row = this.owned(input.sessionHash, input.userSubject);
    if (row.ended || row.expires_at.getTime() <= this.now())
      throw new VoiceStoreError("forbidden");
  }

  private owned(sessionHash: string, userSubject: string) {
    const row = this.sessions.get(sessionHash);
    if (!row || row.user_subject !== userSubject)
      throw new VoiceStoreError("forbidden");
    return row;
  }
}

export const voiceStore = new PrismaVoiceStore();
