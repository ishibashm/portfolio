import { TokenBucket, clientKey } from "@/lib/apiGuard";

/** Per-process backstop. The owner must also configure distributed edge limits. */
export function requestLimiter(capacity: number, refillSeconds: number) {
  const callers = new TokenBucket(capacity, 1 / (refillSeconds * 1000));
  const total = new TokenBucket(capacity * 20, 20 / (refillSeconds * 1000), 1);
  return (headers: Headers): Response | null => {
    const now = Date.now();
    const key = clientKey(headers);
    if (!total.take("all", now) || !callers.take(key, now)) {
      return Response.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(refillSeconds),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return null;
  };
}

/** Enforce actual streamed bytes, even without (or with forged) Content-Length. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const reject = (status: number) => ({
    ok: false as const,
    response: Response.json(
      { error: status === 413 ? "Request too large" : "Invalid JSON" },
      { status },
    ),
  });
  if (Number(request.headers.get("content-length")) > maxBytes)
    return reject(413);
  const reader = request.body?.getReader();
  if (!reader) return reject(400);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return reject(413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
    };
  } catch {
    return reject(400);
  } finally {
    reader.releaseLock();
  }
}
