import { cookies } from "next/headers";
import { isSameOrigin } from "@/lib/apiGuard";
import { readCookieFromHeader } from "@/lib/guide/guideForm";
import {
  GUIDE_MEMORY_COOKIE,
  GUIDE_MEMORY_MAX_SLUGS,
  GUIDE_MEMORY_MAX_TOPICS,
  guideMemoryConfig,
  guideMemoryPrefSchema,
  guideMemorySlugSchema,
  guideMemoryStarSchema,
  guideMemoryTopicSchema,
  memoryCookieHeader,
  saveMemory,
  type GuideMemoryPatch,
  type GuideMemoryTopicKey,
} from "@/lib/guide/guideMemory";

export const runtime = "nodejs";

/** フォーム本文の最大サイズ（4KB）。 */
const MAX_FORM_BODY_BYTES = 4096;

/** リダイレクト先は固定パスのみとし、入力値は一切含めない。 */
const REDIRECT_MEMORY = "/annai/memory";
const REDIRECT_SAVED = "/annai/memory?saved=1";
const REDIRECT_CONSENT_ERROR = "/annai/memory?e=consent";

const ALLOWED_BACK_PATHS: ReadonlySet<string> = new Set([
  "/annai/memory",
  "/annai",
  "/annai/ask",
]);

function checkSameOrigin(request: Request): boolean {
  let host = "";
  try {
    host = new URL(request.url).host;
  } catch {
    host = "";
  }
  return isSameOrigin({
    headers: request.headers,
    nextUrl: { host },
  });
}

function redirect303(
  location:
    | typeof REDIRECT_MEMORY
    | typeof REDIRECT_SAVED
    | typeof REDIRECT_CONSENT_ERROR,
  setCookie?: string,
): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
  });
  if (setCookie) {
    headers.set("Set-Cookie", setCookie);
  }
  return new Response(null, {
    status: 303,
    headers,
  });
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type ReadFormResult =
  | { ok: true; form: URLSearchParams }
  | { ok: false; reason: "unsupported_media_type" | "too_large" | "bad_body" };

async function readFormWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<ReadFormResult> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return { ok: false, reason: "unsupported_media_type" };
  }
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return { ok: false, reason: "bad_body" };
    }
    if (contentLength > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }
  if (!request.body) {
    return { ok: true, form: new URLSearchParams() };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "bad_body" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    ok: true,
    form: new URLSearchParams(new TextDecoder().decode(bytes)),
  };
}

async function readExistingMemoryCookie(
  request: Request,
): Promise<string | undefined> {
  const fromHeader = readCookieFromHeader(
    request.headers.get("cookie"),
    GUIDE_MEMORY_COOKIE,
  );
  if (fromHeader !== undefined) {
    return fromHeader;
  }
  try {
    const store = await cookies();
    return store.get(GUIDE_MEMORY_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

function parsePatchFromForm(form: URLSearchParams): GuideMemoryPatch {
  const patch: GuideMemoryPatch = {};

  const rawStar = form.get("star")?.trim();
  if (rawStar && /^\d+$/.test(rawStar)) {
    const parsedStar = guideMemoryStarSchema.safeParse(Number(rawStar));
    if (parsedStar.success) {
      patch.star = parsedStar.data;
    }
  }

  const rawPref = form.get("pref")?.trim();
  if (rawPref) {
    const parsedPref = guideMemoryPrefSchema.safeParse(rawPref);
    if (parsedPref.success) {
      patch.pref = parsedPref.data;
    }
  }

  const topics: GuideMemoryTopicKey[] = [];
  for (const rawTopic of form.getAll("topic")) {
    const parsedTopic = guideMemoryTopicSchema.safeParse(rawTopic.trim());
    if (parsedTopic.success && !topics.includes(parsedTopic.data)) {
      topics.push(parsedTopic.data);
      if (topics.length >= GUIDE_MEMORY_MAX_TOPICS) break;
    }
  }
  if (topics.length > 0) {
    patch.topics = topics;
  }

  const slugs: string[] = [];
  for (const rawSlug of form.getAll("slug")) {
    const parsedSlug = guideMemorySlugSchema.safeParse(rawSlug.trim());
    if (parsedSlug.success && !slugs.includes(parsedSlug.data)) {
      slugs.push(parsedSlug.data);
      if (slugs.length >= GUIDE_MEMORY_MAX_SLUGS) break;
    }
  }
  if (slugs.length > 0) {
    patch.slugs = slugs;
  }

  return patch;
}

/**
 * 案内役の長期記憶（/annai/memory/save）を保存する POST ハンドラ。
 * 同意（consent === "yes"）が無い場合は一切書き込まず Cookie も発行しない。
 */
export async function POST(request: Request): Promise<Response> {
  if (!checkSameOrigin(request)) {
    return jsonError(403, "forbidden");
  }

  const parsedBody = await readFormWithinLimit(request, MAX_FORM_BODY_BYTES);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "unsupported_media_type") {
      return jsonError(415, "unsupported_media_type");
    }
    if (parsedBody.reason === "too_large") {
      return jsonError(413, "payload_too_large");
    }
    return jsonError(400, "bad_request");
  }

  const form = parsedBody.form;
  // back は固定セットのみ許可（リダイレクト自体は常に固定の /annai/memory 系へ返す）
  const rawBack = form.get("back")?.trim() ?? REDIRECT_MEMORY;
  void ALLOWED_BACK_PATHS.has(rawBack);

  const consent = form.get("consent")?.trim();
  if (consent !== "yes") {
    return redirect303(REDIRECT_CONSENT_ERROR);
  }

  if (!guideMemoryConfig(process.env).enabled) {
    return redirect303(REDIRECT_MEMORY);
  }

  const patch = parsePatchFromForm(form);
  const existingCookie = await readExistingMemoryCookie(request);

  try {
    const saved = await saveMemory({
      cookieValue: existingCookie,
      patch,
      consent: true,
    });
    return redirect303(REDIRECT_SAVED, memoryCookieHeader(saved.cookieValue));
  } catch {
    return redirect303(REDIRECT_MEMORY);
  }
}
