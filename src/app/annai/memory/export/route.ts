import { cookies } from "next/headers";
import { readCookieFromHeader } from "@/lib/guide/guideForm";
import {
  GUIDE_MEMORY_COOKIE,
  exportMemory,
  guideMemoryConfig,
} from "@/lib/guide/guideMemory";

export const runtime = "nodejs";

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
 * 案内役の長期記憶（/annai/memory/export）を JSON ファイルとして書き出す GET ハンドラ。
 */
export async function GET(request: Request): Promise<Response> {
  if (!guideMemoryConfig(process.env).enabled) {
    return new Response(JSON.stringify({ found: false }), {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const existingCookie = await readExistingMemoryCookie(request);
  const exported = await exportMemory(existingCookie).catch(() => null);
  if (!exported) {
    return new Response(JSON.stringify({ found: false }), {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(JSON.stringify(exported, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="annai-memory.json"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
