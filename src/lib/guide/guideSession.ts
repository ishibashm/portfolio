/**
 * 案内役AI（/annai/ask）のS1会話メモ暗号化（サーバー非保存・フォームhidden保持）。
 *
 * AES-256-GCM（12バイト乱数nonce + 16バイト認証タグ + AAD ["guide-session-v1", purpose]）で
 * 会話メモと送信フォームトークンを封印し、base64url 文字列として返す。
 * GUIDE_SESSION_KEY は32バイトのbase64文字列が必須で、既定鍵は置かない。
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

export const GUIDE_SESSION_MAX_TURNS = 8;
export const GUIDE_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const GUIDE_SESSION_MAX_SEALED = 8192;
export const GUIDE_SESSION_RECENT_MAX = 4;
export const GUIDE_SESSION_MEMO_CHARS = 40;
export const GUIDE_FORM_TOKEN_MIN_AGE_MS = 2_000;
export const GUIDE_FORM_TOKEN_MAX_AGE_MS = GUIDE_SESSION_TTL_MS;

type Purpose = "session" | "form";
type Env = Record<string, string | undefined>;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export const guideRecentTurnSchema = z
  .object({
    q: z.string().min(1).max(200),
    a: z.string().max(4000),
    slugs: z.array(z.string().regex(SLUG_RE)).max(5),
  })
  .strict();

export const guideSessionPayloadSchema = z
  .object({
    v: z.literal(1),
    startedAt: z.number().int().nonnegative(),
    lastAt: z.number().int().nonnegative(),
    turns: z.number().int().min(1).max(GUIDE_SESSION_MAX_TURNS),
    memo: z
      .array(z.string().max(GUIDE_SESSION_MEMO_CHARS))
      .max(GUIDE_SESSION_MAX_TURNS),
    recent: z.array(guideRecentTurnSchema).min(1).max(GUIDE_SESSION_RECENT_MAX),
  })
  .strict();

const formTokenPayloadSchema = z
  .object({
    v: z.literal(1),
    issuedAt: z.number().int().nonnegative(),
  })
  .strict();

export type GuideRecentTurn = z.infer<typeof guideRecentTurnSchema>;
export type GuideSessionPayload = z.infer<typeof guideSessionPayloadSchema>;

export type OpenGuideSessionResult =
  | { status: "none"; session?: undefined }
  | { status: "ok"; session: GuideSessionPayload }
  | { status: "expired"; session?: undefined }
  | { status: "invalid"; session?: undefined }
  | { status: "full"; session: GuideSessionPayload };

export type CheckFormTokenResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "too_young" | "expired" };

/**
 * 環境変数 GUIDE_SESSION_KEY（32バイトのbase64）を検証して返す。
 * 未設定または32バイトでない場合は null。
 */
export function guideSessionKey(env: Env = process.env): Buffer | null {
  const raw = env.GUIDE_SESSION_KEY?.trim();
  if (!raw) return null;
  const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length % 4 === 0;
  const isBase64Url = /^[A-Za-z0-9_-]+={0,2}$/.test(raw);
  if (!isBase64 && !isBase64Url) return null;
  try {
    const buf = Buffer.from(
      raw,
      raw.includes("-") || raw.includes("_") ? "base64url" : "base64",
    );
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

function buildAad(purpose: Purpose): Buffer {
  return Buffer.from(JSON.stringify(["guide-session-v1", purpose]), "utf8");
}

function sealRaw(payload: unknown, key: Uint8Array, purpose: Purpose): string {
  const keyBuf = Buffer.from(key);
  if (keyBuf.length !== 32) {
    throw new Error("guide_session_key_invalid");
  }
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, nonce);
  cipher.setAAD(buildAad(purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]).toString("base64url");
}

function openRaw(
  sealed: string,
  key: Uint8Array,
  purpose: Purpose,
): unknown | null {
  try {
    const keyBuf = Buffer.from(key);
    if (keyBuf.length !== 32) return null;
    if (!sealed || sealed.length > GUIDE_SESSION_MAX_SEALED) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(sealed)) return null;
    const bytes = Buffer.from(sealed, "base64url");
    if (bytes.length < 30) return null;
    const nonce = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const ciphertext = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyBuf, nonce);
    decipher.setAAD(buildAad(purpose));
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/**
 * 封印された会話セッションを復号・検証する。
 * 改ざん・鍵不一致・スキーマ不正は例外を投げず status: "invalid" を返す。
 */
export function openGuideSession(
  sealed: string | undefined | null,
  key: Uint8Array,
  now = Date.now(),
): OpenGuideSessionResult {
  if (sealed === undefined || sealed === null || sealed.trim() === "") {
    return { status: "none" };
  }
  const trimmed = sealed.trim();
  if (Buffer.byteLength(trimmed, "utf8") > GUIDE_SESSION_MAX_SEALED) {
    return { status: "invalid" };
  }
  const raw = openRaw(trimmed, key, "session");
  if (!raw) return { status: "invalid" };
  const parsed = guideSessionPayloadSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const session = parsed.data;
  if (now - session.lastAt >= GUIDE_SESSION_TTL_MS) {
    return { status: "expired" };
  }
  if (session.turns >= GUIDE_SESSION_MAX_TURNS) {
    return { status: "full", session };
  }
  return { status: "ok", session };
}

/**
 * 会話に1問分のやり取りを追加する。
 * 直近（recent）が4件を超えたら、古いものから質問の先頭40文字だけを memo に畳む。
 */
export function appendGuideTurn(
  session: GuideSessionPayload | null,
  turn: { q: string; a: string; slugs: string[] },
  now = Date.now(),
): GuideSessionPayload {
  const q = turn.q.trim().slice(0, 200) || "質問";
  const a = turn.a.trim().slice(0, 4000);
  const slugs = turn.slugs.filter((s) => SLUG_RE.test(s)).slice(0, 5);

  if (!session) {
    return {
      v: 1,
      startedAt: now,
      lastAt: now,
      turns: 1,
      memo: [],
      recent: [{ q, a, slugs }],
    };
  }

  const memo = [...session.memo];
  const recent = [...session.recent, { q, a, slugs }];
  while (recent.length > GUIDE_SESSION_RECENT_MAX) {
    const oldest = recent.shift()!;
    memo.push(oldest.q.slice(0, GUIDE_SESSION_MEMO_CHARS));
  }
  while (memo.length > GUIDE_SESSION_MAX_TURNS) {
    memo.shift();
  }

  return {
    v: 1,
    startedAt: session.startedAt,
    lastAt: now,
    turns: Math.min(GUIDE_SESSION_MAX_TURNS, session.turns + 1),
    memo,
    recent,
  };
}

/**
 * 会話セッションを暗号化する。
 * 封印後の文字列が 8KB（8192 bytes）を超える場合は、古い memo 行を落とし、
 * それでも超える場合は古い回答（recent[].a）から順に切り詰めて 8KB 以内に収める。
 */
export function sealGuideSession(
  session: GuideSessionPayload,
  key: Uint8Array,
): string {
  const memo = [...session.memo].map((m) =>
    m.slice(0, GUIDE_SESSION_MEMO_CHARS),
  );
  const recent = session.recent.map((r) => ({
    q: r.q.slice(0, 200),
    a: r.a.slice(0, 4000),
    slugs: r.slugs.filter((s) => SLUG_RE.test(s)).slice(0, 5),
  }));
  while (recent.length > GUIDE_SESSION_RECENT_MAX) {
    const oldest = recent.shift()!;
    memo.push(oldest.q.slice(0, GUIDE_SESSION_MEMO_CHARS));
  }

  const build = (): GuideSessionPayload => ({
    v: 1,
    startedAt: session.startedAt,
    lastAt: session.lastAt,
    turns: Math.min(GUIDE_SESSION_MAX_TURNS, Math.max(1, session.turns)),
    memo,
    recent,
  });

  let sealed = sealRaw(build(), key, "session");
  while (sealed.length > GUIDE_SESSION_MAX_SEALED && memo.length > 0) {
    memo.shift();
    sealed = sealRaw(build(), key, "session");
  }

  for (
    let i = 0;
    i < recent.length && sealed.length > GUIDE_SESSION_MAX_SEALED;
    i++
  ) {
    while (sealed.length > GUIDE_SESSION_MAX_SEALED && recent[i].a.length > 0) {
      const nextLen =
        recent[i].a.length > 64 ? Math.floor(recent[i].a.length / 2) : 0;
      recent[i].a = recent[i].a.slice(0, nextLen);
      sealed = sealRaw(build(), key, "session");
    }
  }

  return sealed;
}

/** フォーム表示時刻を封印したトークンを発行する（purpose="form"）。 */
export function sealFormToken(key: Uint8Array, now = Date.now()): string {
  return sealRaw({ v: 1, issuedAt: now }, key, "form");
}

/**
 * フォームトークンを検証する。
 * 発行から2秒未満（ボット連打）または2時間以上経過、復号失敗を拒否する。
 */
export function checkFormToken(
  token: string | undefined | null,
  key: Uint8Array,
  now = Date.now(),
): CheckFormTokenResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "invalid" };
  }
  const raw = openRaw(token.trim(), key, "form");
  if (!raw) return { ok: false, reason: "invalid" };
  const parsed = formTokenPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const age = now - parsed.data.issuedAt;
  if (age < GUIDE_FORM_TOKEN_MIN_AGE_MS) {
    return { ok: false, reason: "too_young" };
  }
  if (age >= GUIDE_FORM_TOKEN_MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}
