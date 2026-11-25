import { cookies } from "next/headers";
import { isSameOrigin } from "@/lib/apiGuard";
import { readCookieFromHeader } from "@/lib/guide/guideForm";
import {
  GUIDE_MEMORY_COOKIE,
  clearMemoryCookieHeader,
  deleteMemory,
  guideMemoryConfig,
} from "@/lib/guide/guideMemory";

export const runtime = "nodejs";

const MAX_FORM_BODY_BYTES = 4096;
const REDIRECT_DELETED = "/annai/memory?deleted=1";

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

async function drainFormWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<boolean> {
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength > maxBytes) {
      return false;
    }
  }
  const type = request.headers.get("content-type") ?? "";
  if (
    type &&
    !type.toLowerCase().startsWith("application/x-www-form-urlencoded")
  ) {
    return false;
  }
  if (!request.body) return true;
  const reader = request.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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

/**
 * 案内役の長期記憶（/annai/memory/delete）を削除し Cookie を消去する POST ハンドラ。
 */
export async function POST(request: Request): Promise<Response> {
  if (!checkSameOrigin(request)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const okBody = await drainFormWithinLimit(request, MAX_FORM_BODY_BYTES);
  if (!okBody) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const existingCookie = await readExistingMemoryCookie(request);
  if (guideMemoryConfig(process.env).enabled) {
    await deleteMemory(existingCookie).catch(() => {});
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: REDIRECT_DELETED,
      "Cache-Control": "no-store",
      "Set-Cookie": clearMemoryCookieHeader(),
    },
  });
}
