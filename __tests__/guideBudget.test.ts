import { beforeEach, describe, expect, it } from "vitest";
import {
  GUIDE_GLOBAL_DAILY_QUESTIONS,
  GUIDE_GLOBAL_HOURLY_QUESTIONS,
  GUIDE_NEURON_STOP,
  GUIDE_NEURON_WARN,
  GUIDE_PERSON_DAILY_QUESTIONS,
  GUIDE_PERSON_PER_MINUTE,
  GUIDE_QUESTION_RESERVE_NEURONS,
  admitFreeQuestion,
  admitSummary,
  neuronUsage,
  resetGuideBudgetMemory,
  settleNeurons,
  utcDayKey,
  utcHourKey,
} from "@/lib/guide/guideBudget";
import type { GuideUsageDb } from "@/lib/guide/workersAi";

type Row = { requests: number; tokens: number };

/**
 * agent_usage_daily の条件付きアトミック upsert / update / select を模倣するインメモリDB。
 */
function createFakeUsageDb(): GuideUsageDb & {
  rows: Map<string, Row>;
} {
  const rows = new Map<string, Row>();
  const keyOf = (day: string, hash: string) => `${day}:${hash}`;

  const db: GuideUsageDb & { rows: Map<string, Row> } = {
    rows,
    $queryRaw: async <T = unknown>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T> => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim();

      if (sql.startsWith("SELECT tokens FROM agent_usage_daily")) {
        const day = String(values[0]);
        const hash = String(values[1]);
        const row = rows.get(keyOf(day, hash));
        return (row ? [{ tokens: row.tokens }] : []) as unknown as T;
      }

      if (sql.startsWith("UPDATE agent_usage_daily SET tokens = GREATEST")) {
        const delta = Number(values[0]);
        const day = String(values[1]);
        const hash = String(values[2]);
        const row = rows.get(keyOf(day, hash));
        if (!row) return [] as unknown as T;
        row.tokens = Math.max(0, row.tokens + delta);
        return [{ tokens: row.tokens }] as unknown as T;
      }

      if (sql.includes("RETURNING tokens")) {
        const day = String(values[0]);
        const hash = String(values[1]);
        const reserveMilli = Number(values[2]);
        const limitMilli = Number(values[4]);
        const k = keyOf(day, hash);
        const existing = rows.get(k);
        if (!existing) {
          if (reserveMilli > limitMilli) return [] as unknown as T;
          const created = { requests: 1, tokens: reserveMilli };
          rows.set(k, created);
          return [{ tokens: created.tokens }] as unknown as T;
        }
        if (existing.tokens + reserveMilli > limitMilli) {
          return [] as unknown as T;
        }
        existing.requests += 1;
        existing.tokens += reserveMilli;
        return [{ tokens: existing.tokens }] as unknown as T;
      }

      if (sql.includes("RETURNING requests")) {
        const day = String(values[0]);
        const hash = String(values[1]);
        const hasLimit = values.length >= 3;
        const limit = hasLimit ? Number(values[2]) : Infinity;
        const k = keyOf(day, hash);
        const existing = rows.get(k);
        if (!existing) {
          if (1 > limit) return [] as unknown as T;
          const created = { requests: 1, tokens: 0 };
          rows.set(k, created);
          return [{ requests: created.requests }] as unknown as T;
        }
        if (existing.requests >= limit) {
          return [] as unknown as T;
        }
        existing.requests += 1;
        return [{ requests: existing.requests }] as unknown as T;
      }

      throw new Error(`unexpected sql: ${sql}`);
    },
  };

  return db;
}

const failingDb: GuideUsageDb = {
  $queryRaw: async () => {
    throw new Error("db_down");
  },
};

function ipHeaders(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

const TEST_ENV = { API_SECRET_KEY: "test-budget-hmac-secret" };

beforeEach(() => {
  resetGuideBudgetMemory();
});

describe("guideBudget: UTC 日付・時間キー", () => {
  it("UTC 00:00（日本時間 09:00）を境目に日付が切り替わる", () => {
    const beforeUtcMidnight = Date.parse("2026-11-25T23:59:59Z"); // 2026-11-26 08:59:59 JST
    const atUtcMidnight = Date.parse("2026-11-26T00:00:00Z"); // 2026-11-26 09:00:00 JST

    expect(utcDayKey(beforeUtcMidnight)).toBe("2026-11-25");
    expect(utcDayKey(atUtcMidnight)).toBe("2026-11-26");
    expect(utcDayKey(beforeUtcMidnight)).not.toBe(utcDayKey(atUtcMidnight));

    // 日本時間での 08:59 と 09:00 が異なる UTC 日になること
    const jst0859 = Date.parse("2026-11-26T08:59:00+09:00");
    const jst0900 = Date.parse("2026-11-26T09:00:00+09:00");
    expect(utcDayKey(jst0859)).toBe("2026-11-25");
    expect(utcDayKey(jst0900)).toBe("2026-11-26");
    expect(utcHourKey(jst0859)).toBe("2026-11-25T23");
    expect(utcHourKey(jst0900)).toBe("2026-11-26T00");
  });
});

describe("guideBudget: レート・回数・ニューロン上限", () => {
  const baseAt = Date.parse("2026-11-25T10:00:00Z");

  it("1分あたり3回を超えると rate_minute で拒否し、時間が進めば回復する", async () => {
    const db = createFakeUsageDb();
    const h = ipHeaders("192.0.2.10");

    for (let i = 0; i < GUIDE_PERSON_PER_MINUTE; i++) {
      const r = await admitFreeQuestion({
        at: baseAt,
        headers: h,
        isNewConversation: true,
        db,
        env: TEST_ENV,
      });
      expect(r.ok).toBe(true);
    }

    const blocked = await admitFreeQuestion({
      at: baseAt,
      headers: h,
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(blocked).toEqual({ ok: false, reason: "rate_minute" });

    // 20秒後には1トークン回復する
    const recovered = await admitFreeQuestion({
      at: baseAt + 20_000,
      headers: h,
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(recovered.ok).toBe(true);
  });

  it("同一人物（IP）の1日上限は8回で、9回目は person_daily で拒否し、DBに生IPを保存しない", async () => {
    const db = createFakeUsageDb();
    const ip = "198.51.100.77";
    const h = ipHeaders(ip);

    for (let i = 0; i < GUIDE_PERSON_DAILY_QUESTIONS; i++) {
      const r = await admitFreeQuestion({
        at: baseAt + i * 60_000,
        headers: h,
        isNewConversation: false,
        db,
        env: TEST_ENV,
      });
      expect(r.ok).toBe(true);
    }

    const ninth = await admitFreeQuestion({
      at: baseAt + 9 * 60_000,
      headers: h,
      isNewConversation: false,
      db,
      env: TEST_ENV,
    });
    expect(ninth).toEqual({ ok: false, reason: "person_daily" });

    for (const k of db.rows.keys()) {
      expect(k).not.toContain(ip);
    }
  });

  it("1時間の全体上限12回は新規会話のみブロックし、継続会話は13回目以降も通して加算する", async () => {
    const db = createFakeUsageDb();

    for (let i = 0; i < GUIDE_GLOBAL_HOURLY_QUESTIONS; i++) {
      const r = await admitFreeQuestion({
        at: baseAt + i * 1_000,
        headers: ipHeaders(`203.0.113.${i + 1}`),
        isNewConversation: true,
        db,
        env: TEST_ENV,
      });
      expect(r.ok).toBe(true);
    }

    const blockedNew = await admitFreeQuestion({
      at: baseAt + 20_000,
      headers: ipHeaders("203.0.113.200"),
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(blockedNew).toEqual({ ok: false, reason: "hourly" });

    // 継続会話は同じ時間枠でも通る
    const allowedContinuing = await admitFreeQuestion({
      at: baseAt + 21_000,
      headers: ipHeaders("203.0.113.201"),
      isNewConversation: false,
      db,
      env: TEST_ENV,
    });
    expect(allowedContinuing.ok).toBe(true);
  });

  it("1日の全体上限45回を超えると global_daily で拒否する", async () => {
    const db = createFakeUsageDb();
    const dayStart = Date.parse("2026-11-25T00:00:00Z");

    for (let i = 0; i < GUIDE_GLOBAL_DAILY_QUESTIONS; i++) {
      // 同一UTC日の中で時間枠上限・ニューロン上限に先に当たらないよう時間を分散し、ニューロンは0で精算する
      const at = dayStart + i * 10 * 60_000;
      const r = await admitFreeQuestion({
        at,
        headers: ipHeaders(`10.0.${Math.floor(i / 200)}.${(i % 200) + 1}`),
        isNewConversation: true,
        db,
        env: TEST_ENV,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        await settleNeurons(r.ticket, 0, db);
      }
    }

    const overGlobal = await admitFreeQuestion({
      at: dayStart + 46 * 10 * 60_000,
      headers: ipHeaders("10.9.9.9"),
      isNewConversation: false,
      db,
      env: TEST_ENV,
    });
    expect(overGlobal).toEqual({ ok: false, reason: "global_daily" });
  });

  it("ニューロン警告閾値（6,300）で新規会話は busy になり、継続会話は 9,000 まで通る", async () => {
    const db = createFakeUsageDb();

    // 1回目で予約260 → 6,100 neurons で精算（残り新規枠 200 < 260）
    const first = await admitFreeQuestion({
      at: baseAt,
      headers: ipHeaders("192.0.2.1"),
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      await settleNeurons(first.ticket, GUIDE_NEURON_WARN - 200, db);
    }
    expect(await neuronUsage({ at: baseAt, db, env: TEST_ENV })).toBe(6100);

    // 新規会話（6100 + 260 > 6300）は busy
    const newConv = await admitFreeQuestion({
      at: baseAt + 1_000,
      headers: ipHeaders("192.0.2.2"),
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(newConv).toEqual({ ok: false, reason: "busy" });

    // 継続会話（6100 + 260 <= 9000）は許可される
    const contConv = await admitFreeQuestion({
      at: baseAt + 2_000,
      headers: ipHeaders("192.0.2.3"),
      isNewConversation: false,
      db,
      env: TEST_ENV,
    });
    expect(contConv.ok).toBe(true);
    if (contConv.ok) {
      // 合計が 8,800 neurons（6100 + 2700）になるよう精算（8800 + 260 > 9000）
      await settleNeurons(contConv.ticket, 2700, db);
    }
    expect(await neuronUsage({ at: baseAt, db, env: TEST_ENV })).toBe(8800);

    // 9,000 を超える継続会話は neurons_stop
    const stoppedCont = await admitFreeQuestion({
      at: baseAt + 3_000,
      headers: ipHeaders("192.0.2.4"),
      isNewConversation: false,
      db,
      env: TEST_ENV,
    });
    expect(stoppedCont).toEqual({ ok: false, reason: "neurons_stop" });

    // 合計 8,800 の時点では定型要約（+60 = 8860 <= 9000）は通る。それを +160 で精算して合計 8,960 にすると次は null
    const summaryTicket = await admitSummary({
      at: baseAt + 4_000,
      db,
      env: TEST_ENV,
    });
    expect(summaryTicket).not.toBeNull();
    if (summaryTicket) {
      await settleNeurons(summaryTicket, 160, db);
    }
    expect(await neuronUsage({ at: baseAt, db, env: TEST_ENV })).toBe(
      GUIDE_NEURON_STOP - 40,
    );
    const rejectedSummary = await admitSummary({
      at: baseAt + 5_000,
      db,
      env: TEST_ENV,
    });
    expect(rejectedSummary).toBeNull();
  });

  it("settleNeurons は予約値（260）との差分をミリニューロン単位で精算する", async () => {
    const db = createFakeUsageDb();
    const res = await admitFreeQuestion({
      at: baseAt,
      headers: ipHeaders("192.0.2.50"),
      isNewConversation: true,
      db,
      env: TEST_ENV,
    });
    expect(res.ok).toBe(true);
    expect(await neuronUsage({ at: baseAt, db, env: TEST_ENV })).toBe(
      GUIDE_QUESTION_RESERVE_NEURONS,
    );

    if (res.ok) {
      await settleNeurons(res.ticket, 42.375, db);
      // 2回目の settleNeurons 呼び出しは無視される
      await settleNeurons(res.ticket, 500, db);
    }
    expect(await neuronUsage({ at: baseAt, db, env: TEST_ENV })).toBeCloseTo(
      42.375,
      3,
    );
  });

  it("DB失敗時はプロセス内メモリにフォールバックし、各上限を半分（person=4, hourly=6, warn=3150）にする", async () => {
    const h = ipHeaders("198.51.100.99");

    // 個人日次上限 8 の半分 = 4回まで許可、5回目は person_daily
    for (let i = 0; i < 4; i++) {
      const r = await admitFreeQuestion({
        at: baseAt + i * 60_000,
        headers: h,
        isNewConversation: false,
        db: failingDb,
        env: TEST_ENV,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        await settleNeurons(r.ticket, 10, failingDb);
      }
    }
    const fifthPerson = await admitFreeQuestion({
      at: baseAt + 5 * 60_000,
      headers: h,
      isNewConversation: false,
      db: failingDb,
      env: TEST_ENV,
    });
    expect(fifthPerson).toEqual({ ok: false, reason: "person_daily" });

    // メモリのニューロン警告上限 6300/2 = 3150 を検証
    resetGuideBudgetMemory();
    const firstNew = await admitFreeQuestion({
      at: baseAt,
      headers: ipHeaders("198.51.100.1"),
      isNewConversation: true,
      db: failingDb,
      env: TEST_ENV,
    });
    expect(firstNew.ok).toBe(true);
    if (firstNew.ok) {
      await settleNeurons(firstNew.ticket, 3000, failingDb);
    }
    expect(
      await neuronUsage({ at: baseAt, db: failingDb, env: TEST_ENV }),
    ).toBe(3000);

    // 3000 + 260 > 3150 なので新規は busy
    const secondNew = await admitFreeQuestion({
      at: baseAt + 1_000,
      headers: ipHeaders("198.51.100.2"),
      isNewConversation: true,
      db: failingDb,
      env: TEST_ENV,
    });
    expect(secondNew).toEqual({ ok: false, reason: "busy" });
  });
});
