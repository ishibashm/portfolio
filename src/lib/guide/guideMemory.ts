/**
 * 案内役（/annai/memory）の同意した人だけの長期記憶。
 *
 * 既定はオフ（GUIDE_MEMORY_ENABLED === "true" かつ GUIDE_MEMORY_KEY が 32 バイトの base64 のときのみ有効）。
 * ブラウザには 32 バイト乱数の base64url（43 文字）だけを HttpOnly Cookie（annai_mem）として置き、
 * DB（guide_memory 表）には HMAC-SHA256 の id_hash（64 文字）と AES-256-GCM 暗号化 payload だけを保存する。
 * 生の Cookie ID・質問文・回答文・生年月日・氏名・連絡先・IP アドレスは保存せず、ログにも一切出さない。
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { GUIDE_TOPIC_KEYS, GUIDE_TOPICS } from "./guideForm";

export const GUIDE_MEMORY_COOKIE = "annai_mem";
export const GUIDE_MEMORY_TTL_DAYS = 90;
export const GUIDE_MEMORY_MAX_DAYS = 365;
export const GUIDE_MEMORY_CONSENT_VERSION = "2026-11-25";
export const GUIDE_MEMORY_MAX_SLUGS = 20;
export const GUIDE_MEMORY_MAX_TOPICS = 5;
export const GUIDE_MEMORY_CLEANUP_BATCH = 200;
export const GUIDE_MEMORY_COOKIE_MAX_AGE = GUIDE_MEMORY_TTL_DAYS * 24 * 60 * 60; // 7776000

const DAY_MS = 24 * 60 * 60 * 1000;
const DB_TIMEOUT_MS = 1_500;
const MAX_PAYLOAD_BYTES = 4096;
const COOKIE_ID_RE = /^[A-Za-z0-9_-]{43}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

type Env = Record<string, string | undefined>;

/** JIS X 0401 都道府県コード（"01"〜"47"）と都道府県名の対応表。 */
export const GUIDE_PREFECTURES = {
  "01": "北海道",
  "02": "青森県",
  "03": "岩手県",
  "04": "宮城県",
  "05": "秋田県",
  "06": "山形県",
  "07": "福島県",
  "08": "茨城県",
  "09": "栃木県",
  "10": "群馬県",
  "11": "埼玉県",
  "12": "千葉県",
  "13": "東京都",
  "14": "神奈川県",
  "15": "新潟県",
  "16": "富山県",
  "17": "石川県",
  "18": "福井県",
  "19": "山梨県",
  "20": "長野県",
  "21": "岐阜県",
  "22": "静岡県",
  "23": "愛知県",
  "24": "三重県",
  "25": "滋賀県",
  "26": "京都府",
  "27": "大阪府",
  "28": "兵庫県",
  "29": "奈良県",
  "30": "和歌山県",
  "31": "鳥取県",
  "32": "島根県",
  "33": "岡山県",
  "34": "広島県",
  "35": "山口県",
  "36": "徳島県",
  "37": "香川県",
  "38": "愛媛県",
  "39": "高知県",
  "40": "福岡県",
  "41": "佐賀県",
  "42": "長崎県",
  "43": "熊本県",
  "44": "大分県",
  "45": "宮崎県",
  "46": "鹿児島県",
  "47": "沖縄県",
} as const;

export type GuidePrefCode = keyof typeof GUIDE_PREFECTURES;

export const GUIDE_PREF_CODES = Object.keys(
  GUIDE_PREFECTURES,
) as GuidePrefCode[];

export const GUIDE_MEMORY_TOPIC_KEYS = [
  ...GUIDE_TOPIC_KEYS,
  "move",
  "today",
] as const;

export type GuideMemoryTopicKey = (typeof GUIDE_MEMORY_TOPIC_KEYS)[number];

export const GUIDE_MEMORY_TOPIC_LABELS: Record<GuideMemoryTopicKey, string> = {
  honmei: GUIDE_TOPICS.honmei.label,
  kippou: GUIDE_TOPICS.kippou.label,
  tenchusatsu: GUIDE_TOPICS.tenchusatsu.label,
  hidori: GUIDE_TOPICS.hidori.label,
  rokuyo: GUIDE_TOPICS.rokuyo.label,
  hinoeuma: GUIDE_TOPICS.hinoeuma.label,
  toukei: GUIDE_TOPICS.toukei.label,
  move: "引越しの方位と日取り",
  today: "今日の吉方位",
};

export const guideMemoryStarSchema = z.number().int().min(1).max(9);

export const guideMemoryPrefSchema = z
  .string()
  .refine((v): v is GuidePrefCode =>
    Object.prototype.hasOwnProperty.call(GUIDE_PREFECTURES, v),
  );

export const guideMemoryTopicSchema = z.enum(GUIDE_MEMORY_TOPIC_KEYS);

export const guideMemorySlugSchema = z.string().regex(SLUG_RE);

function isUniqueArray<T>(items: readonly T[]): boolean {
  return new Set(items).size === items.length;
}

/** 暗号化して保存する記憶ペイロードの厳格なスキーマ（自由文は一切持たない）。 */
export const guideMemoryPayloadSchema = z
  .object({
    v: z.literal(1),
    star: guideMemoryStarSchema.optional(),
    pref: guideMemoryPrefSchema.optional(),
    topics: z
      .array(guideMemoryTopicSchema)
      .max(GUIDE_MEMORY_MAX_TOPICS)
      .refine(isUniqueArray, { message: "topics must be unique" }),
    slugs: z
      .array(guideMemorySlugSchema)
      .max(GUIDE_MEMORY_MAX_SLUGS)
      .refine(isUniqueArray, { message: "slugs must be unique" }),
  })
  .strict();

export type GuideMemoryPayload = z.infer<typeof guideMemoryPayloadSchema>;

/** saveMemory に渡す差分の厳格なスキーマ。 */
export const guideMemoryPatchSchema = z
  .object({
    star: guideMemoryStarSchema.optional(),
    pref: guideMemoryPrefSchema.optional(),
    topic: guideMemoryTopicSchema.optional(),
    topics: z.array(guideMemoryTopicSchema).optional(),
    slug: guideMemorySlugSchema.optional(),
    slugs: z.array(guideMemorySlugSchema).optional(),
  })
  .strict();

export type GuideMemoryPatch = z.infer<typeof guideMemoryPatchSchema>;

export type GuideMemoryConfig =
  | {
      enabled: true;
      encKey: Buffer;
      idKey: Buffer;
      keyVersion: "v1";
    }
  | {
      enabled: false;
      reason: "disabled" | "key_missing" | "key_invalid";
    };

function parseMasterKey(raw: string | undefined): Buffer | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const isBase64 =
    /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0;
  const isBase64Url = /^[A-Za-z0-9_-]+={0,2}$/.test(trimmed);
  if (!isBase64 && !isBase64Url) return null;
  try {
    const buf = Buffer.from(
      trimmed,
      trimmed.includes("-") || trimmed.includes("_") ? "base64url" : "base64",
    );
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * 環境変数から長期記憶の有効状態と派生鍵（encKey / idKey）を返す。
 * GUIDE_MEMORY_ENABLED === "true" かつ GUIDE_MEMORY_KEY が 32 バイトの base64 のときだけ有効。
 */
export function guideMemoryConfig(env: Env = process.env): GuideMemoryConfig {
  if (env.GUIDE_MEMORY_ENABLED !== "true") {
    return { enabled: false, reason: "disabled" };
  }
  const rawKey = env.GUIDE_MEMORY_KEY?.trim();
  if (!rawKey) {
    return { enabled: false, reason: "key_missing" };
  }
  const masterKey = parseMasterKey(rawKey);
  if (!masterKey) {
    return { enabled: false, reason: "key_invalid" };
  }
  const encKey = Buffer.from(
    hkdfSync(
      "sha256",
      masterKey,
      Buffer.alloc(0),
      Buffer.from("guide-memory-enc-v1", "utf8"),
      32,
    ),
  );
  const idKey = Buffer.from(
    hkdfSync(
      "sha256",
      masterKey,
      Buffer.alloc(0),
      Buffer.from("guide-memory-id-v1", "utf8"),
      32,
    ),
  );
  return {
    enabled: true,
    encKey,
    idKey,
    keyVersion: "v1",
  };
}

/** 32 バイト乱数を base64url（43 文字）で返す。 */
export function generateMemoryCookieId(): string {
  return randomBytes(32).toString("base64url");
}

/** Cookie の値が 32 バイト乱数の base64url（43 文字）か厳格に検証する。 */
export function isValidMemoryCookieId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!COOKIE_ID_RE.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").length === 32;
  } catch {
    return false;
  }
}

/** Cookie ID から DB 主キー用の HMAC-SHA256（64 文字 hex）を計算する。 */
export function hashMemoryCookieId(
  idKey: Uint8Array,
  cookieId: string,
): string {
  return createHmac("sha256", Buffer.from(idKey))
    .update(cookieId, "utf8")
    .digest("hex");
}

/** 利用者表示・開示削除照会用の記憶 ID（id_hash の末尾 8 文字）。 */
export function memoryIdLabel(idHash: string): string {
  return idHash.slice(-8).toLowerCase();
}

function buildMemoryAad(idHash: string, keyVersion: string): Buffer {
  return Buffer.from(
    JSON.stringify(["guide-memory-v1", idHash, keyVersion]),
    "utf8",
  );
}

/**
 * ペイロードを AES-256-GCM（12 バイト nonce + 16 バイト tag + ciphertext）で暗号化する。
 * AAD に ["guide-memory-v1", idHash, keyVersion] を束縛し、別行への付け替えを防ぐ。
 */
export function encryptMemoryPayload(
  payload: GuideMemoryPayload,
  encKey: Uint8Array,
  idHash: string,
  keyVersion = "v1",
): Buffer {
  const validated = guideMemoryPayloadSchema.parse(payload);
  const keyBuf = Buffer.from(encKey);
  if (keyBuf.length !== 32) {
    throw new Error("guide_memory_enc_key_invalid");
  }
  const plaintext = Buffer.from(JSON.stringify(validated), "utf8");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, nonce);
  cipher.setAAD(buildMemoryAad(idHash, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([nonce, tag, ciphertext]);
  if (combined.byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error("guide_memory_payload_too_large");
  }
  return combined;
}

/**
 * AES-256-GCM で暗号化された payload を復号し、zod スキーマで検証する。
 * 改ざん・AAD 不一致・スキーマ不正のときは null を返す。
 */
export function decryptMemoryPayload(
  encrypted: Uint8Array,
  encKey: Uint8Array,
  idHash: string,
  keyVersion = "v1",
): GuideMemoryPayload | null {
  try {
    const keyBuf = Buffer.from(encKey);
    if (keyBuf.length !== 32) return null;
    if (
      !encrypted ||
      encrypted.byteLength < 12 + 16 + 2 ||
      encrypted.byteLength > MAX_PAYLOAD_BYTES
    ) {
      return null;
    }
    const buf = Buffer.from(encrypted);
    const nonce = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyBuf, nonce);
    decipher.setAAD(buildMemoryAad(idHash, keyVersion));
    decipher.setAuthTag(tag);
    const jsonText = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsedJson: unknown = JSON.parse(jsonText);
    const validated = guideMemoryPayloadSchema.safeParse(parsedJson);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

/**
 * 既存の記憶と新しい差分をマージする。
 * slugs は新しいものを先頭（most-recent-first）にして重複を除き最大 20 件に切り詰める。
 * topics も重複を除き最大 5 件に切り詰める。
 */
export function mergeMemoryPayload(
  existing: GuideMemoryPayload | null | undefined,
  rawPatch: GuideMemoryPatch,
): GuideMemoryPayload {
  const parsedPatch = guideMemoryPatchSchema.parse(rawPatch);

  const star = parsedPatch.star ?? existing?.star;
  const pref = parsedPatch.pref ?? existing?.pref;

  const incomingTopics: GuideMemoryTopicKey[] = [
    ...(parsedPatch.topic ? [parsedPatch.topic] : []),
    ...(parsedPatch.topics ?? []),
  ];
  const mergedTopics: GuideMemoryTopicKey[] = [];
  for (const t of [...incomingTopics, ...(existing?.topics ?? [])]) {
    if (!mergedTopics.includes(t)) {
      mergedTopics.push(t);
    }
    if (mergedTopics.length >= GUIDE_MEMORY_MAX_TOPICS) break;
  }

  const incomingSlugs: string[] = [
    ...(parsedPatch.slug ? [parsedPatch.slug] : []),
    ...(parsedPatch.slugs ?? []),
  ];
  const mergedSlugs: string[] = [];
  for (const s of [...incomingSlugs, ...(existing?.slugs ?? [])]) {
    if (!mergedSlugs.includes(s)) {
      mergedSlugs.push(s);
    }
    if (mergedSlugs.length >= GUIDE_MEMORY_MAX_SLUGS) break;
  }

  return guideMemoryPayloadSchema.parse({
    v: 1,
    ...(star !== undefined ? { star } : {}),
    ...(pref !== undefined ? { pref } : {}),
    topics: mergedTopics,
    slugs: mergedSlugs,
  });
}

/**
 * 有効期限を計算する: LEAST(now + 90 days, created_at + 365 days)。
 */
export function computeMemoryExpiresAt(createdAt: Date, now: Date): Date {
  const ttlMs = now.getTime() + GUIDE_MEMORY_TTL_DAYS * DAY_MS;
  const maxMs = createdAt.getTime() + GUIDE_MEMORY_MAX_DAYS * DAY_MS;
  return new Date(Math.min(ttlMs, maxMs));
}

export type GuideMemoryDb = {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
  $executeRaw?: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<number>;
};

export type GuideMemoryRow = {
  idHash: string;
  payload: Uint8Array;
  keyVersion: string;
  consentVersion: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
};

export interface GuideMemoryStore {
  cleanup(now: Date): Promise<number>;
  get(idHash: string, now: Date): Promise<GuideMemoryRow | null>;
  upsert(row: GuideMemoryRow): Promise<GuideMemoryRow>;
  touch(
    idHash: string,
    now: Date,
    nextExpiresAt: Date,
  ): Promise<GuideMemoryRow | null>;
  delete(idHash: string): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("db_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolveDb(db?: GuideMemoryDb): Promise<GuideMemoryDb> {
  if (db) return db;
  return (await import("@/lib/prisma")).default as unknown as GuideMemoryDb;
}

type RawDbRow = {
  id_hash: string;
  payload: Uint8Array | Buffer;
  key_version: string;
  consent_version: string;
  created_at: Date | string;
  last_used_at: Date | string;
  expires_at: Date | string;
};

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function normalizeDbRow(raw: RawDbRow): GuideMemoryRow {
  return {
    idHash: String(raw.id_hash).trim(),
    payload: Buffer.from(raw.payload),
    keyVersion: String(raw.key_version),
    consentVersion: String(raw.consent_version),
    createdAt: toDate(raw.created_at),
    lastUsedAt: toDate(raw.last_used_at),
    expiresAt: toDate(raw.expires_at),
  };
}

/** Raw SQL（Prisma `$queryRaw` / `$executeRaw`）による GuideMemoryStore 実装。 */
export function createPrismaGuideMemoryStore(
  injectedDb?: GuideMemoryDb,
): GuideMemoryStore {
  return {
    async cleanup(now: Date): Promise<number> {
      const run = async () => {
        const db = await resolveDb(injectedDb);
        if (db.$executeRaw) {
          return db.$executeRaw`
            DELETE FROM guide_memory
            WHERE id_hash IN (
              SELECT id_hash FROM guide_memory
              WHERE expires_at <= ${now}
              LIMIT ${GUIDE_MEMORY_CLEANUP_BATCH}
            )
          `;
        }
        const rows = await db.$queryRaw<{ id_hash: string }[]>`
          DELETE FROM guide_memory
          WHERE id_hash IN (
            SELECT id_hash FROM guide_memory
            WHERE expires_at <= ${now}
            LIMIT ${GUIDE_MEMORY_CLEANUP_BATCH}
          )
          RETURNING id_hash
        `;
        return Array.isArray(rows) ? rows.length : 0;
      };
      return withTimeout(run(), DB_TIMEOUT_MS);
    },

    async get(idHash: string, now: Date): Promise<GuideMemoryRow | null> {
      const run = async () => {
        const db = await resolveDb(injectedDb);
        const rows = await db.$queryRaw<RawDbRow[]>`
          SELECT
            id_hash,
            payload,
            key_version,
            consent_version,
            created_at,
            last_used_at,
            expires_at
          FROM guide_memory
          WHERE id_hash = ${idHash} AND expires_at > ${now}
          LIMIT 1
        `;
        if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) return null;
        return normalizeDbRow(rows[0]);
      };
      return withTimeout(run(), DB_TIMEOUT_MS);
    },

    async upsert(row: GuideMemoryRow): Promise<GuideMemoryRow> {
      const payloadBuf = Buffer.from(row.payload);
      const run = async () => {
        const db = await resolveDb(injectedDb);
        const rows = await db.$queryRaw<RawDbRow[]>`
          INSERT INTO guide_memory (
            id_hash,
            payload,
            key_version,
            consent_version,
            created_at,
            last_used_at,
            expires_at
          )
          VALUES (
            ${row.idHash},
            ${payloadBuf},
            ${row.keyVersion},
            ${row.consentVersion},
            ${row.createdAt},
            ${row.lastUsedAt},
            ${row.expiresAt}
          )
          ON CONFLICT (id_hash) DO UPDATE
          SET payload = EXCLUDED.payload,
              key_version = EXCLUDED.key_version,
              consent_version = EXCLUDED.consent_version,
              last_used_at = EXCLUDED.last_used_at,
              expires_at = LEAST(
                EXCLUDED.expires_at,
                guide_memory.created_at + interval '365 days'
              )
          RETURNING
            id_hash,
            payload,
            key_version,
            consent_version,
            created_at,
            last_used_at,
            expires_at
        `;
        if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) {
          return row;
        }
        return normalizeDbRow(rows[0]);
      };
      return withTimeout(run(), DB_TIMEOUT_MS);
    },

    async touch(
      idHash: string,
      now: Date,
      nextExpiresAt: Date,
    ): Promise<GuideMemoryRow | null> {
      const run = async () => {
        const db = await resolveDb(injectedDb);
        const rows = await db.$queryRaw<RawDbRow[]>`
          UPDATE guide_memory
          SET last_used_at = ${now},
              expires_at = LEAST(
                ${nextExpiresAt},
                guide_memory.created_at + interval '365 days'
              )
          WHERE id_hash = ${idHash} AND expires_at > ${now}
          RETURNING
            id_hash,
            payload,
            key_version,
            consent_version,
            created_at,
            last_used_at,
            expires_at
        `;
        if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) return null;
        return normalizeDbRow(rows[0]);
      };
      return withTimeout(run(), DB_TIMEOUT_MS);
    },

    async delete(idHash: string): Promise<void> {
      const run = async () => {
        const db = await resolveDb(injectedDb);
        if (db.$executeRaw) {
          await db.$executeRaw`
            DELETE FROM guide_memory WHERE id_hash = ${idHash}
          `;
          return;
        }
        await db.$queryRaw`
          DELETE FROM guide_memory WHERE id_hash = ${idHash}
        `;
      };
      await withTimeout(run(), DB_TIMEOUT_MS);
    },
  };
}

function resolveStore(opts?: {
  store?: GuideMemoryStore;
  db?: GuideMemoryDb;
}): GuideMemoryStore {
  return opts?.store ?? createPrismaGuideMemoryStore(opts?.db);
}

function toNowDate(now?: Date | number): Date {
  if (now instanceof Date) return now;
  if (typeof now === "number") return new Date(now);
  return new Date();
}

/**
 * 期限切れ行（expires_at <= now()）を最大 200 件削除する（piggyback cleanup）。
 * 失敗しても呼び出し元の読み書きを止めない（best-effort）。
 */
export async function cleanupExpired(
  dbOrStore?: GuideMemoryDb | GuideMemoryStore,
  now?: Date | number,
): Promise<number> {
  const nowDate = toNowDate(now);
  try {
    if (dbOrStore && "cleanup" in dbOrStore) {
      return await dbOrStore.cleanup(nowDate);
    }
    const store = createPrismaGuideMemoryStore(
      dbOrStore as GuideMemoryDb | undefined,
    );
    return await store.cleanup(nowDate);
  } catch {
    return 0;
  }
}

export type GuideMemoryDeps = {
  db?: GuideMemoryDb;
  store?: GuideMemoryStore;
  env?: Env;
  now?: Date | number;
  touch?: boolean;
};

export type ReadMemoryResult =
  | { status: "off" }
  | { status: "none" }
  | {
      status: "ok";
      memory: GuideMemoryPayload;
      idLabel: string;
      consentVersion: string;
      createdAt: Date;
      lastUsedAt: Date;
      expiresAt: Date;
    };

/**
 * Cookie 値から長期記憶を読み出す。
 * - 機能オフ時は store を一切呼ばず `{ status: "off" }` を返す。
 * - 先頭で期限切れ行の piggyback cleanup を実行する。
 * - 復号失敗・AAD 不一致・期限切れは `{ status: "none" }` として扱う。
 * - `touch: true` のときは last_used_at を now に、expires_at を LEAST(now + 90d, created_at + 365d) に延長する。
 */
export async function readMemory(
  cookieValue: string | undefined | null,
  opts: GuideMemoryDeps = {},
): Promise<ReadMemoryResult> {
  const env = opts.env ?? process.env;
  const config = guideMemoryConfig(env);
  if (!config.enabled) {
    return { status: "off" };
  }

  const nowDate = toNowDate(opts.now);
  const store = resolveStore(opts);
  await cleanupExpired(store, nowDate);

  if (!isValidMemoryCookieId(cookieValue)) {
    return { status: "none" };
  }

  const idHash = hashMemoryCookieId(config.idKey, cookieValue);
  let row: GuideMemoryRow | null = null;
  try {
    row = await store.get(idHash, nowDate);
  } catch {
    return { status: "none" };
  }
  if (!row || row.expiresAt.getTime() <= nowDate.getTime()) {
    return { status: "none" };
  }

  const memory = decryptMemoryPayload(
    row.payload,
    config.encKey,
    row.idHash,
    row.keyVersion,
  );
  if (!memory) {
    return { status: "none" };
  }

  let lastUsedAt = row.lastUsedAt;
  let expiresAt = row.expiresAt;

  if (opts.touch) {
    const nextExpiresAt = computeMemoryExpiresAt(row.createdAt, nowDate);
    try {
      const touched = await store.touch(idHash, nowDate, nextExpiresAt);
      if (touched) {
        lastUsedAt = touched.lastUsedAt;
        expiresAt = touched.expiresAt;
      } else {
        lastUsedAt = nowDate;
        expiresAt = nextExpiresAt;
      }
    } catch {
      // touch の失敗では読み出し自体を失敗させない
    }
  }

  return {
    status: "ok",
    memory,
    idLabel: memoryIdLabel(idHash),
    consentVersion: row.consentVersion,
    createdAt: row.createdAt,
    lastUsedAt,
    expiresAt,
  };
}

export type SaveMemoryInput = {
  cookieValue?: string | null;
  patch: GuideMemoryPatch;
  consent: boolean;
  db?: GuideMemoryDb;
  store?: GuideMemoryStore;
  env?: Env;
  now?: Date | number;
};

export type SaveMemoryResult = {
  cookieValue: string;
  idLabel: string;
  memory: GuideMemoryPayload;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
};

/**
 * 同意（consent === true）を必須として記憶を保存・更新する。
 * - 機能オフまたは consent !== true のときは何も書き込まず例外を投げる。
 * - 有効な既存行があればマージして created_at を維持し、無ければ新しいランダム Cookie ID を発行する。
 */
export async function saveMemory(
  input: SaveMemoryInput,
): Promise<SaveMemoryResult> {
  const env = input.env ?? process.env;
  const config = guideMemoryConfig(env);
  if (!config.enabled) {
    throw new Error("guide_memory_disabled");
  }
  if (input.consent !== true) {
    throw new Error("guide_memory_consent_required");
  }

  // patch を先に厳格検証し、不正なら store に一切触れない
  const validatedPatch = guideMemoryPatchSchema.parse(input.patch);

  const nowDate = toNowDate(input.now);
  const store = resolveStore(input);
  await cleanupExpired(store, nowDate);

  let cookieId: string | undefined;
  let idHash: string | undefined;
  let existingMemory: GuideMemoryPayload | null = null;
  let createdAt = nowDate;

  if (isValidMemoryCookieId(input.cookieValue)) {
    const candidateHash = hashMemoryCookieId(config.idKey, input.cookieValue);
    const existingRow = await store
      .get(candidateHash, nowDate)
      .catch(() => null);
    if (existingRow && existingRow.expiresAt.getTime() > nowDate.getTime()) {
      const decrypted = decryptMemoryPayload(
        existingRow.payload,
        config.encKey,
        existingRow.idHash,
        existingRow.keyVersion,
      );
      if (decrypted) {
        cookieId = input.cookieValue;
        idHash = candidateHash;
        existingMemory = decrypted;
        createdAt = existingRow.createdAt;
      }
    }
  }

  if (!cookieId || !idHash) {
    cookieId = generateMemoryCookieId();
    idHash = hashMemoryCookieId(config.idKey, cookieId);
    createdAt = nowDate;
  }

  const merged = mergeMemoryPayload(existingMemory, validatedPatch);
  const encrypted = encryptMemoryPayload(
    merged,
    config.encKey,
    idHash,
    config.keyVersion,
  );
  const expiresAt = computeMemoryExpiresAt(createdAt, nowDate);

  const savedRow = await store.upsert({
    idHash,
    payload: encrypted,
    keyVersion: config.keyVersion,
    consentVersion: GUIDE_MEMORY_CONSENT_VERSION,
    createdAt,
    lastUsedAt: nowDate,
    expiresAt,
  });

  return {
    cookieValue: cookieId,
    idLabel: memoryIdLabel(idHash),
    memory: merged,
    createdAt: savedRow.createdAt,
    lastUsedAt: savedRow.lastUsedAt,
    expiresAt: savedRow.expiresAt,
  };
}

/**
 * Cookie に紐づく記憶行を削除する。
 * 機能オフ時は store を一切呼ばない。
 */
export async function deleteMemory(
  cookieValue: string | undefined | null,
  opts: GuideMemoryDeps = {},
): Promise<{ deleted: boolean }> {
  const env = opts.env ?? process.env;
  const config = guideMemoryConfig(env);
  if (!config.enabled) {
    return { deleted: false };
  }

  const nowDate = toNowDate(opts.now);
  const store = resolveStore(opts);
  await cleanupExpired(store, nowDate);

  if (!isValidMemoryCookieId(cookieValue)) {
    return { deleted: false };
  }

  const idHash = hashMemoryCookieId(config.idKey, cookieValue);
  await store.delete(idHash);
  return { deleted: true };
}

export type GuideMemoryExportJson = {
  memoryId: string;
  consentVersion: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  data: {
    star: number | null;
    pref: GuidePrefCode | null;
    prefName: string | null;
    topics: GuideMemoryTopicKey[];
    slugs: string[];
  };
};

export function formatMemoryExport(
  readResult: Extract<ReadMemoryResult, { status: "ok" }>,
): GuideMemoryExportJson {
  const { memory, idLabel, consentVersion, createdAt, lastUsedAt, expiresAt } =
    readResult;
  const pref = memory.pref ?? null;
  return {
    memoryId: idLabel,
    consentVersion,
    createdAt: createdAt.toISOString(),
    lastUsedAt: lastUsedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    data: {
      star: memory.star ?? null,
      pref,
      prefName: pref ? GUIDE_PREFECTURES[pref] : null,
      topics: [...memory.topics],
      slugs: [...memory.slugs],
    },
  };
}

/**
 * 記憶を書き出し用のプレーン JSON オブジェクトに変換する。
 * 生の Cookie ID や id_hash 全文は含めず、末尾 8 桁の memoryId のみを返す。
 */
export async function exportMemory(
  cookieValue: string | undefined | null,
  opts: GuideMemoryDeps = {},
): Promise<GuideMemoryExportJson | null> {
  const res = await readMemory(cookieValue, { ...opts, touch: false });
  if (res.status !== "ok") {
    return null;
  }
  return formatMemoryExport(res);
}

/**
 * annai_mem Cookie の Set-Cookie ヘッダー値を作る（常に HttpOnly; Secure; SameSite=Lax）。
 */
export function memoryCookieHeader(value: string): string {
  return `${GUIDE_MEMORY_COOKIE}=${value}; Path=/annai; Max-Age=${GUIDE_MEMORY_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * annai_mem Cookie を即時消去する Set-Cookie ヘッダー値を作る（Max-Age=0、常に Secure）。
 */
export function clearMemoryCookieHeader(): string {
  return `${GUIDE_MEMORY_COOKIE}=; Path=/annai; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
