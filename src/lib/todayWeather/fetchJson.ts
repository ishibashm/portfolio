/**
 * 外部の公開 JSON を短い待ち時間で取る。失敗・時間切れ・不正な JSON は null。
 * ページを落とさないため、例外は外に出さない。
 * `next.revalidate` で Next のデータキャッシュに載せ、訪問ごとには取りに行かない。
 * Cloud Run ではデータキャッシュがインスタンスごとのファイルで外れやすいので、
 * 同じインスタンスの中では URL ごとにメモリーへも持つ（期限は revalidate と同じ）。
 * 同時に来た取得は 1 本にまとめ、期限切れ後に取れなかったときは直前の値を返す。
 */
export const FETCH_TIMEOUT_MS = 3000;
const cache = new Map<string, { value: unknown; expires: number }>();
const inFlight = new Map<string, Promise<unknown | null>>();
const MAX_ENTRIES = 64;

export function __resetFetchJsonCacheForTest() {
  cache.clear();
  inFlight.clear();
}

export async function fetchJson(
  url: string,
  revalidateSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;
  const pending = inFlight.get(url);
  if (pending) return pending;
  const request = (async () => {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: revalidateSeconds },
      } as RequestInit);
      if (!response.ok) return cached?.value ?? null;
      const value: unknown = await response.json();
      cache.delete(url);
      cache.set(url, { value, expires: Date.now() + revalidateSeconds * 1000 });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      return value;
    } catch {
      return cached?.value ?? null;
    }
  })();
  inFlight.set(url, request);
  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}
