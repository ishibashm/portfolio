import { fetchJson } from "./fetchJson";
import { todayInJapan } from "@/utils/japanDate";

/** JSONのキーは日本時間。品質0の当日観測だけを読み、未来・欠測を除く。 */
export function parseAmedasMinimum(
  json: unknown,
  now = new Date(),
): number | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json))
    return undefined;
  const day = todayInJapan(now).replaceAll("-", "");
  let min = Infinity;
  for (const [stamp, row] of Object.entries(json)) {
    if (!/^\d{14}$/.test(stamp) || !stamp.startsWith(day)) continue;
    const time = Date.parse(
      `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}+09:00`,
    );
    if (!Number.isFinite(time) || time > now.getTime()) continue;
    const temp: unknown = row && typeof row === "object" ? row.temp : null;
    if (
      Array.isArray(temp) &&
      temp[1] === 0 &&
      typeof temp[0] === "number" &&
      Number.isFinite(temp[0])
    )
      min = Math.min(min, temp[0]);
  }
  return Number.isFinite(min) ? min : undefined;
}

export async function getAmedasMinimum(
  amedas: string,
  now = new Date(),
  fetchImpl?: typeof fetch,
): Promise<number | undefined> {
  const day = todayInJapan(now).replaceAll("-", "");
  const hour = new Date(now.getTime() + 9 * 3600000).getUTCHours();
  const block = Math.floor(hour / 3) * 3;
  const results = await Promise.allSettled(
    Array.from({ length: block / 3 + 1 }, async (_, i) => {
      const hh = String(i * 3).padStart(2, "0");
      // 直前ブロックの末尾は配信遅延を見込み、次の時間までは短くキャッシュ。
      const complete = i * 3 + 4 <= hour;
      const json = await fetchJson(
        `https://www.jma.go.jp/bosai/amedas/data/point/${amedas}/${day}_${hh}.json`,
        complete ? 86400 : 900,
        fetchImpl,
      );
      return parseAmedasMinimum(json, now);
    }),
  );
  const values = results.flatMap((result) =>
    result.status === "fulfilled" && result.value !== undefined
      ? [result.value]
      : [],
  );
  return values.length ? Math.round(Math.min(...values)) : undefined;
}
