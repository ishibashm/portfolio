/**
 * 外部の公開 JSON を短い待ち時間で取る。失敗・時間切れ・不正な JSON は null。
 * ページを落とさないため、例外は外に出さない。
 * `next.revalidate` で Next のデータキャッシュに載せ、訪問ごとには取りに行かない。
 */
export const FETCH_TIMEOUT_MS = 3000;

export async function fetchJson(
  url: string,
  revalidateSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: revalidateSeconds },
    } as RequestInit);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
