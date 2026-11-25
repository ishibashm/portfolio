import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  answerFreeQuestion,
  verifyFreeformText,
} from "@/lib/guide/guideFreeform";
import {
  GUIDE_MEMORY_CLEANUP_BATCH,
  GUIDE_MEMORY_CONSENT_VERSION,
  GUIDE_MEMORY_COOKIE,
  GUIDE_MEMORY_MAX_DAYS,
  GUIDE_MEMORY_MAX_SLUGS,
  GUIDE_MEMORY_TTL_DAYS,
  GUIDE_PREFECTURES,
  clearMemoryCookieHeader,
  computeMemoryExpiresAt,
  createPrismaGuideMemoryStore,
  deleteMemory,
  exportMemory,
  guideMemoryConfig,
  guideMemoryPayloadSchema,
  hashMemoryCookieId,
  memoryCookieHeader,
  memoryIdLabel,
  readMemory,
  saveMemory,
  type GuideMemoryRow,
  type GuideMemoryStore,
} from "@/lib/guide/guideMemory";
import { sealFormToken } from "@/lib/guide/guideSession";
import { WORKERS_AI_PRIMARY_MODEL } from "@/lib/guide/workersAi";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_NOW = new Date("2026-11-25T03:00:00.000Z");
const TEST_KEY_BUF = randomBytes(32);
const TEST_KEY_B64 = TEST_KEY_BUF.toString("base64");

const enabledEnv = {
  GUIDE_MEMORY_ENABLED: "true",
  GUIDE_MEMORY_KEY: TEST_KEY_B64,
};

function createInMemoryStore(): GuideMemoryStore & {
  rows: Map<string, GuideMemoryRow>;
  calls: {
    cleanup: number;
    get: number;
    upsert: number;
    touch: number;
    delete: number;
  };
} {
  const rows = new Map<string, GuideMemoryRow>();
  const calls = {
    cleanup: 0,
    get: 0,
    upsert: 0,
    touch: 0,
    delete: 0,
  };

  return {
    rows,
    calls,
    async cleanup(now: Date): Promise<number> {
      calls.cleanup++;
      let removed = 0;
      for (const [k, row] of rows.entries()) {
        if (row.expiresAt.getTime() <= now.getTime()) {
          rows.delete(k);
          removed++;
          if (removed >= GUIDE_MEMORY_CLEANUP_BATCH) break;
        }
      }
      return removed;
    },
    async get(idHash: string, now: Date): Promise<GuideMemoryRow | null> {
      calls.get++;
      const row = rows.get(idHash);
      if (!row) return null;
      if (row.expiresAt.getTime() <= now.getTime()) return null;
      return {
        ...row,
        payload: Buffer.from(row.payload),
      };
    },
    async upsert(row: GuideMemoryRow): Promise<GuideMemoryRow> {
      calls.upsert++;
      const existing = rows.get(row.idHash);
      const createdAt = existing ? existing.createdAt : row.createdAt;
      const maxExpireMs = createdAt.getTime() + GUIDE_MEMORY_MAX_DAYS * DAY_MS;
      const expiresAt = new Date(
        Math.min(row.expiresAt.getTime(), maxExpireMs),
      );
      const stored: GuideMemoryRow = {
        ...row,
        payload: Buffer.from(row.payload),
        createdAt,
        expiresAt,
      };
      rows.set(row.idHash, stored);
      return stored;
    },
    async touch(
      idHash: string,
      now: Date,
      nextExpiresAt: Date,
    ): Promise<GuideMemoryRow | null> {
      calls.touch++;
      const existing = rows.get(idHash);
      if (!existing || existing.expiresAt.getTime() <= now.getTime()) {
        return null;
      }
      const maxExpireMs =
        existing.createdAt.getTime() + GUIDE_MEMORY_MAX_DAYS * DAY_MS;
      const updated: GuideMemoryRow = {
        ...existing,
        lastUsedAt: now,
        expiresAt: new Date(Math.min(nextExpiresAt.getTime(), maxExpireMs)),
      };
      rows.set(idHash, updated);
      return updated;
    },
    async delete(idHash: string): Promise<void> {
      calls.delete++;
      rows.delete(idHash);
    },
  };
}

describe("guideMemory: 既定オフ・鍵検証・同意必須", () => {
  it("既定（環境変数なし・鍵なし・32バイト以外の鍵）では無効になり、store を一切呼ばない", async () => {
    expect(guideMemoryConfig({})).toEqual({
      enabled: false,
      reason: "disabled",
    });
    expect(guideMemoryConfig({ GUIDE_MEMORY_ENABLED: "true" })).toEqual({
      enabled: false,
      reason: "key_missing",
    });
    expect(
      guideMemoryConfig({
        GUIDE_MEMORY_ENABLED: "true",
        GUIDE_MEMORY_KEY: randomBytes(16).toString("base64"),
      }),
    ).toEqual({
      enabled: false,
      reason: "key_invalid",
    });

    const store = createInMemoryStore();
    const readRes = await readMemory("A".repeat(43), {
      store,
      env: {},
      now: BASE_NOW,
    });
    expect(readRes).toEqual({ status: "off" });

    await expect(
      saveMemory({
        patch: { star: 7 },
        consent: true,
        store,
        env: {},
        now: BASE_NOW,
      }),
    ).rejects.toThrow("guide_memory_disabled");

    const delRes = await deleteMemory("A".repeat(43), {
      store,
      env: {},
      now: BASE_NOW,
    });
    expect(delRes).toEqual({ deleted: false });

    const expRes = await exportMemory("A".repeat(43), {
      store,
      env: {},
      now: BASE_NOW,
    });
    expect(expRes).toBeNull();

    expect(store.calls).toEqual({
      cleanup: 0,
      get: 0,
      upsert: 0,
      touch: 0,
      delete: 0,
    });
    expect(store.rows.size).toBe(0);
  });

  it("consent !== true の場合は例外を投げ、store に一切書き込まない", async () => {
    const store = createInMemoryStore();
    await expect(
      saveMemory({
        patch: { star: 7, pref: "13" },
        consent: false,
        store,
        env: enabledEnv,
        now: BASE_NOW,
      }),
    ).rejects.toThrow("guide_memory_consent_required");

    expect(store.rows.size).toBe(0);
    expect(store.calls.upsert).toBe(0);
  });
});

describe("guideMemory: 保存・復号・スキーマ検証・AAD・期限・削除・書き出し", () => {
  it("save と read の往復で保存内容が復元され、追記マージで created_at が維持される", async () => {
    const store = createInMemoryStore();
    expect(Object.keys(GUIDE_PREFECTURES)).toHaveLength(47);

    const saved1 = await saveMemory({
      patch: {
        star: 7,
        pref: "13",
        topic: "kippou",
        slugs: ["article-one", "article-two"],
      },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });

    expect(saved1.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saved1.idLabel).toMatch(/^[0-9a-f]{8}$/);
    expect(store.rows.size).toBe(1);

    const read1 = await readMemory(saved1.cookieValue, {
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(read1.status).toBe("ok");
    if (read1.status === "ok") {
      expect(read1.idLabel).toBe(saved1.idLabel);
      expect(read1.consentVersion).toBe(GUIDE_MEMORY_CONSENT_VERSION);
      expect(read1.memory).toEqual({
        v: 1,
        star: 7,
        pref: "13",
        topics: ["kippou"],
        slugs: ["article-one", "article-two"],
      });
    }

    // 10日後に同じ Cookie で別項目をマージ保存
    const later = new Date(BASE_NOW.getTime() + 10 * DAY_MS);
    const saved2 = await saveMemory({
      cookieValue: saved1.cookieValue,
      patch: {
        topic: "move",
        slugs: ["article-three", "article-one"],
      },
      consent: true,
      store,
      env: enabledEnv,
      now: later,
    });

    expect(saved2.cookieValue).toBe(saved1.cookieValue);
    expect(saved2.createdAt.toISOString()).toBe(BASE_NOW.toISOString());
    expect(saved2.lastUsedAt.toISOString()).toBe(later.toISOString());
    expect(saved2.memory).toEqual({
      v: 1,
      star: 7,
      pref: "13",
      topics: ["move", "kippou"],
      slugs: ["article-three", "article-one", "article-two"],
    });
  });

  it("自由文・範囲外の本命星・不正な都道府県コードを拒否し、21件の slugs は先頭20件に切り詰める", async () => {
    const store = createInMemoryStore();

    // スキーマレベルでの拒否（自由文・未知キー・範囲外 star・不正 pref）
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        star: 7,
        topics: [],
        slugs: [],
        freeText: "自由入力テキスト",
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        star: 0,
        topics: [],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        star: 10,
        topics: [],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        pref: "00",
        topics: [],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        pref: "48",
        topics: [],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        pref: "東京都",
        topics: [],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        topics: ["free text topic"],
        slugs: [],
      }).success,
    ).toBe(false);
    expect(
      guideMemoryPayloadSchema.safeParse({
        v: 1,
        topics: [],
        slugs: ["日本語の自由文は不可"],
      }).success,
    ).toBe(false);

    // saveMemory でも不正な star / pref / 自由文は拒否され何も書き込まれない
    await expect(
      saveMemory({
        patch: { star: 10 },
        consent: true,
        store,
        env: enabledEnv,
        now: BASE_NOW,
      }),
    ).rejects.toThrow();
    await expect(
      saveMemory({
        patch: { pref: "99" as never },
        consent: true,
        store,
        env: enabledEnv,
        now: BASE_NOW,
      }),
    ).rejects.toThrow();
    expect(store.rows.size).toBe(0);

    // 21件の有効な slugs を渡すと最新の20件に切り詰められる
    const slugs21 = Array.from({ length: 21 }, (_, i) => `post-slug-${i + 1}`);
    const saved = await saveMemory({
      patch: { slugs: slugs21 },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(saved.memory.slugs).toHaveLength(GUIDE_MEMORY_MAX_SLUGS);
    expect(saved.memory.slugs).toEqual(slugs21.slice(0, 20));
  });

  it("payload の改ざんや別の id_hash への行移動は AAD 不一致で status: none になる", async () => {
    const store = createInMemoryStore();
    const savedA = await saveMemory({
      patch: { star: 3, pref: "27" },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    const savedB = await saveMemory({
      patch: { star: 9, pref: "40" },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });

    const cfg = guideMemoryConfig(enabledEnv);
    expect(cfg.enabled).toBe(true);
    if (!cfg.enabled) return;

    const hashA = hashMemoryCookieId(cfg.idKey, savedA.cookieValue);
    const hashB = hashMemoryCookieId(cfg.idKey, savedB.cookieValue);
    const rowA = store.rows.get(hashA)!;
    const rowB = store.rows.get(hashB)!;

    // 1. rowB の暗号化 payload を rowA の id_hash に移し替える（AAD の idHash が不一致）
    store.rows.set(hashA, {
      ...rowA,
      payload: Buffer.from(rowB.payload),
    });
    const movedRead = await readMemory(savedA.cookieValue, {
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(movedRead).toEqual({ status: "none" });

    // 2. rowB の暗号文の末尾 1 バイトを改ざんする
    const tampered = Buffer.from(rowB.payload);
    tampered[tampered.length - 1] ^= 0xff;
    store.rows.set(hashB, {
      ...rowB,
      payload: tampered,
    });
    const tamperedRead = await readMemory(savedB.cookieValue, {
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(tamperedRead).toEqual({ status: "none" });
  });

  it("有効期限は最終利用+90日で計算され、touch で延長されるが保存開始+365日を超えない", async () => {
    const store = createInMemoryStore();
    const saved = await saveMemory({
      patch: { star: 5 },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });

    const expectedInitialExpiry = new Date(
      BASE_NOW.getTime() + GUIDE_MEMORY_TTL_DAYS * DAY_MS,
    );
    expect(saved.expiresAt.toISOString()).toBe(
      expectedInitialExpiry.toISOString(),
    );

    // 30日後に touch: true で読むと、そこから+90日（開始+120日）へ延びる
    const day30 = new Date(BASE_NOW.getTime() + 30 * DAY_MS);
    const touched30 = await readMemory(saved.cookieValue, {
      store,
      env: enabledEnv,
      now: day30,
      touch: true,
    });
    expect(touched30.status).toBe("ok");
    if (touched30.status === "ok") {
      expect(touched30.lastUsedAt.toISOString()).toBe(day30.toISOString());
      expect(touched30.expiresAt.toISOString()).toBe(
        new Date(day30.getTime() + 90 * DAY_MS).toISOString(),
      );
    }

    // 80日ごとに touch を繰り返して延命しても、300日後の touch で上限は created_at + 365日 で頭打ちになる
    for (const d of [100, 180, 250]) {
      const stepRes = await readMemory(saved.cookieValue, {
        store,
        env: enabledEnv,
        now: new Date(BASE_NOW.getTime() + d * DAY_MS),
        touch: true,
      });
      expect(stepRes.status).toBe("ok");
    }

    const day300 = new Date(BASE_NOW.getTime() + 300 * DAY_MS);
    const maxCap = new Date(
      BASE_NOW.getTime() + GUIDE_MEMORY_MAX_DAYS * DAY_MS,
    );
    expect(computeMemoryExpiresAt(BASE_NOW, day300).toISOString()).toBe(
      maxCap.toISOString(),
    );

    const touched300 = await readMemory(saved.cookieValue, {
      store,
      env: enabledEnv,
      now: day300,
      touch: true,
    });
    expect(touched300.status).toBe("ok");
    if (touched300.status === "ok") {
      expect(touched300.expiresAt.toISOString()).toBe(maxCap.toISOString());
    }
  });

  it("期限切れ行は返されず、read / save / delete の各先頭で cleanup が呼ばれる", async () => {
    const store = createInMemoryStore();
    const expiredSave = await saveMemory({
      patch: { star: 1 },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(store.calls.cleanup).toBe(1);
    expect(store.rows.size).toBe(1);

    // 91日後（期限切れ後）に read すると cleanup で消され status: none になる
    const day91 = new Date(BASE_NOW.getTime() + 91 * DAY_MS);
    const readExpired = await readMemory(expiredSave.cookieValue, {
      store,
      env: enabledEnv,
      now: day91,
    });
    expect(readExpired).toEqual({ status: "none" });
    expect(store.calls.cleanup).toBe(2);
    expect(store.rows.size).toBe(0);

    // delete 時にも cleanup が呼ばれ、対象行が削除される
    const aliveSave = await saveMemory({
      patch: { star: 8 },
      consent: true,
      store,
      env: enabledEnv,
      now: day91,
    });
    expect(store.calls.cleanup).toBe(3);
    expect(store.rows.size).toBe(1);

    const delRes = await deleteMemory(aliveSave.cookieValue, {
      store,
      env: enabledEnv,
      now: day91,
    });
    expect(delRes).toEqual({ deleted: true });
    expect(store.calls.cleanup).toBe(4);
    expect(store.rows.size).toBe(0);
  });

  it("Cookie ヘッダー属性・記憶ID（末尾8桁）・書き出し JSON（生の Cookie ID を含まない）が仕様どおりである", async () => {
    const store = createInMemoryStore();
    const saved = await saveMemory({
      patch: {
        star: 7,
        pref: "13",
        topics: ["kippou", "today"],
        slugs: ["kippou-basics"],
      },
      consent: true,
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });

    const cfg = guideMemoryConfig(enabledEnv);
    expect(cfg.enabled).toBe(true);
    if (!cfg.enabled) return;

    const fullHash = hashMemoryCookieId(cfg.idKey, saved.cookieValue);
    expect(fullHash).toMatch(/^[0-9a-f]{64}$/);
    expect(memoryIdLabel(fullHash)).toBe(fullHash.slice(-8));
    expect(saved.idLabel).toBe(fullHash.slice(-8));

    const setHeader = memoryCookieHeader(saved.cookieValue);
    expect(setHeader).toBe(
      `${GUIDE_MEMORY_COOKIE}=${saved.cookieValue}; Path=/annai; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(clearMemoryCookieHeader()).toBe(
      `${GUIDE_MEMORY_COOKIE}=; Path=/annai; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    );

    const exported = await exportMemory(saved.cookieValue, {
      store,
      env: enabledEnv,
      now: BASE_NOW,
    });
    expect(exported).toEqual({
      memoryId: fullHash.slice(-8),
      consentVersion: GUIDE_MEMORY_CONSENT_VERSION,
      createdAt: BASE_NOW.toISOString(),
      lastUsedAt: BASE_NOW.toISOString(),
      expiresAt: new Date(BASE_NOW.getTime() + 90 * DAY_MS).toISOString(),
      data: {
        star: 7,
        pref: "13",
        prefName: "東京都",
        topics: ["kippou", "today"],
        slugs: ["kippou-basics"],
      },
    });

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain(saved.cookieValue);
    expect(serialized).not.toContain(fullHash);
  });

  it("createPrismaGuideMemoryStore が raw SQL テンプレートで cleanup / get / upsert / touch / delete を実行する", async () => {
    const queries: string[] = [];
    const fakeDb = {
      $queryRaw: async <T = unknown>(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<T> => {
        const sql = strings.join("?").replace(/\s+/g, " ").trim();
        queries.push(sql);
        if (sql.startsWith("INSERT INTO guide_memory")) {
          return [
            {
              id_hash: values[0],
              payload: values[1],
              key_version: values[2],
              consent_version: values[3],
              created_at: values[4],
              last_used_at: values[5],
              expires_at: values[6],
            },
          ] as unknown as T;
        }
        return [] as unknown as T;
      },
      $executeRaw: async (strings: TemplateStringsArray): Promise<number> => {
        const sql = strings.join("?").replace(/\s+/g, " ").trim();
        queries.push(sql);
        return 1;
      },
    };

    const prismaStore = createPrismaGuideMemoryStore(fakeDb);
    await prismaStore.cleanup(BASE_NOW);
    await prismaStore.get("a".repeat(64), BASE_NOW);
    await prismaStore.upsert({
      idHash: "a".repeat(64),
      payload: Buffer.from([1, 2, 3]),
      keyVersion: "v1",
      consentVersion: GUIDE_MEMORY_CONSENT_VERSION,
      createdAt: BASE_NOW,
      lastUsedAt: BASE_NOW,
      expiresAt: new Date(BASE_NOW.getTime() + 90 * DAY_MS),
    });
    await prismaStore.touch(
      "a".repeat(64),
      BASE_NOW,
      new Date(BASE_NOW.getTime() + 90 * DAY_MS),
    );
    await prismaStore.delete("a".repeat(64));

    expect(queries[0]).toContain("DELETE FROM guide_memory WHERE id_hash IN");
    expect(queries[1]).toContain("SELECT id_hash, payload");
    expect(queries[2]).toContain("INSERT INTO guide_memory");
    expect(queries[3]).toContain("UPDATE guide_memory SET last_used_at");
    expect(queries[4]).toContain("DELETE FROM guide_memory WHERE id_hash =");
  });
});

describe("guideMemory と guideFreeform の連携（いまの条件）", () => {
  it("conditions（本命星・都道府県・話題）が自由質問の untrusted ブロック『いまの条件』と照合根拠に渡される", async () => {
    const verified = verifyFreeformText(
      "あなたの本命星は7（七赤金星）で、出発地は東京都です。",
      [
        {
          articles: [
            {
              title: "七赤金星の吉方位",
              slug: "shichiseki-kippou",
              url: "https://cloud-palette.com/blog/shichiseki-kippou",
              score: 10,
            },
          ],
        },
      ],
      "吉方位の考え方は？",
      { star: 7, pref: "13", topics: ["kippou"] },
    );
    expect(verified.kept).toEqual([
      "あなたの本命星は7（七赤金星）で、出発地は東京都です。",
    ]);

    const sessionKeyBuf = randomBytes(32);
    const nowMs = BASE_NOW.getTime();
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: {
              choices: [
                {
                  message: {
                    content:
                      "「七赤金星の吉方位」によると、本命星7（七赤金星）の解説があります。",
                  },
                },
              ],
              usage: { prompt_tokens: 200, completion_tokens: 40 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const res = await answerFreeQuestion(
      {
        question: "吉方位の記事は？",
        formToken: sealFormToken(sessionKeyBuf, nowMs - 5_000),
        headers: new Headers({ "x-forwarded-for": "198.51.100.77" }),
        conditions: { star: 7, pref: "13", topics: ["kippou"] },
      },
      {
        env: {
          GUIDE_AI_ENABLED: "true",
          GUIDE_AI_PROVIDER: "workers-ai",
          CLOUDFLARE_WORKERS_AI_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
          CLOUDFLARE_WORKERS_AI_TOKEN: "test-token",
          GUIDE_SESSION_KEY: sessionKeyBuf.toString("base64"),
        },
        fetchFn: fetchFn as unknown as typeof fetch,
        callTool: async () => ({
          articles: [
            {
              title: "七赤金星の吉方位",
              slug: "shichiseki-kippou",
              url: "https://cloud-palette.com/blog/shichiseki-kippou",
              score: 12,
              snippet: "七赤金星の解説記事です。",
            },
          ],
        }),
        now: () => nowMs,
      },
    );

    expect(res.status).toBe("ok");
    expect(res.sentences).toEqual([
      "「七赤金星の吉方位」によると、本命星7（七赤金星）の解説があります。",
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const firstCall = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(String(firstCall.body));
    expect(body.messages[1].content).toContain("いまの条件");
    expect(body.messages[1].content).toContain("七赤金星");
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain(
      WORKERS_AI_PRIMARY_MODEL,
    );
  });
});

describe("guide_memory SQL マイグレーションの安全性検査", () => {
  it("20261125_add_guide_memory.sql は RLS 有効化と anon/authenticated からの権限剥奪を含み、DROP を含まない", () => {
    const sqlPath = join(
      process.cwd(),
      "prisma",
      "sql",
      "20261125_add_guide_memory.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS guide_memory");
    expect(sql).toContain("ALTER TABLE guide_memory ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+guide_memory\s+FROM\s+anon,\s*authenticated/i,
    );
    expect(sql).not.toMatch(/\bDROP\b/i);

    const cronSqlPath = join(
      process.cwd(),
      "prisma",
      "sql",
      "20261125_guide_memory_cron_optional.sql",
    );
    const cronSql = readFileSync(cronSqlPath, "utf8");
    expect(cronSql).toContain("pg_cron");
    expect(cronSql).toContain("guide_memory_expire");
    expect(cronSql).not.toMatch(/\bDROP\b/i);
  });
});
