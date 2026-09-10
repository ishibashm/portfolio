import type { Pool } from "pg";
import { normalize } from "@geolonia/normalize-japanese-addresses";

/**
 * 住所から座標を引く。**賃貸と売地で共通。**
 *
 * geocode_properties.ts に書いてあったものをそのまま出した。表に依存する
 * 処理（どの表のどの行を埋めるか）は呼ぶ側が持ち、ここは「住所 → 座標」と
 * その永続キャッシュ（geocode_towns 表）だけを見る。
 *
 * 売地（land_listings）も同じ町丁目を引くので、**キャッシュを共有できる。**
 * 賃貸の掲載がある町丁目は既に表にあり、国土地理院への新規の要求は
 * 売地にしか無い町丁目のぶんだけで済む（CLAUDE.md 3 節）。
 */

/**
 * Geolonia の normalize() は町名までは正しく分解するが、返す point が
 * 町丁目ごとの座標とは限らない。岡崎市では 706 種類の町名がすべて level=3 と
 * 判定されながら同一の点（＝市の代表点）を返していた。level を見ても防げない。
 * 実際に 157,116 件中 72,527 件が「50件以上が完全に同一座標」の塊に入っていた。
 *
 * 方位は基準点からこの座標への方角で決まるため、市の中心に固まると
 * 同じ市の物件がすべて同じ方位・同じ距離になり、吉凶判定が意味を成さない。
 *
 * そこで座標は国土地理院の住所検索を正とする。上の岡崎市の例でも
 * 字レベルまでばらけた座標が返ることを確認済み。
 * normalize() は住所の表記ゆれを整えるためだけに使う。
 */
export const GSI_ENDPOINT =
  "https://msearch.gsi.go.jp/address-search/AddressSearch";

export type GeoPoint = { lat: number; lon: number };
export type GeoResult =
  | { kind: "ok"; point: GeoPoint }
  | { kind: "not_found" }
  | { kind: "error" };

// 同じ町丁目の物件が大量にあるため、町単位で引いて使い回す。
// これが無いと 1 物件 1 リクエストになり、公共APIに対して過剰な負荷になる。
//
// キャッシュは geocode_towns 表に永続化する。プロセス内だけだと実行のたびに
// 同じ町を引き直すため、仕事の総量が「行数」に比例してしまう。表に持てば
// 総量は「町丁目の数」（全国でも約19万）で頭打ちになり、全国展開しても
// 国土地理院への負荷はワンタイムで済む。
const townCache = new Map<string, GeoResult>();
let gsiCalls = 0;

export async function lookupGsi(query: string): Promise<GeoResult> {
  try {
    const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { kind: "error" };
    const json = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
    }>;
    const top = json?.[0];
    const coords = top?.geometry?.coordinates;
    if (!coords || coords.length < 2) return { kind: "not_found" };
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") {
      return { kind: "not_found" };
    }
    return { kind: "ok", point: { lat, lon } };
  } catch {
    return { kind: "error" };
  }
}

export async function geocodeAddress(
  pool: Pool,
  address: string,
): Promise<GeoResult> {
  let query = address;
  try {
    // 表記ゆれの吸収（"稲熊町字６丁目" -> "稲熊町字六丁目" など）と、
    // 番地・建物名を落として町丁目単位のキーにする。
    const n = await normalize(address);
    if (n.pref && n.city) {
      query = `${n.pref}${n.city}${n.town ?? ""}`;
    }
  } catch {
    // 正規化に失敗しても生の住所で引けることがあるのでそのまま進む
  }

  const cached = townCache.get(query);
  if (cached) return cached;

  const result = await lookupGsi(query);
  gsiCalls++;
  // エラーは一時的なものなのでキャッシュしない（次回また試す）
  if (result.kind !== "error") {
    townCache.set(query, result);
    // 永続キャッシュは best-effort。書けなくても処理は続ける。
    try {
      await pool.query(
        `INSERT INTO geocode_towns (town, lat, lon, not_found)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (town) DO UPDATE
           SET lat = EXCLUDED.lat, lon = EXCLUDED.lon,
               not_found = EXCLUDED.not_found, updated_at = now()`,
        [
          query,
          result.kind === "ok" ? result.point.lat : null,
          result.kind === "ok" ? result.point.lon : null,
          result.kind === "not_found",
        ],
      );
    } catch {
      /* noop */
    }
  }
  // 公共APIなので間隔を空ける。キャッシュヒット時は待たない。
  await new Promise((r) => setTimeout(r, 200));
  return result;
}

/**
 * 永続キャッシュ（geocode_towns）を読み込む。**引く前に必ず 1 回呼ぶ。**
 *
 * 表が無ければ作る。この表は Prisma の管理外で、賃貸の geocode が
 * 自分で作っていたものをそのまま出した。
 */
export async function preloadTownCache(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS geocode_towns (
       town       text PRIMARY KEY,
       lat        double precision,
       lon        double precision,
       not_found  boolean NOT NULL DEFAULT false,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  // not_found も引き直さないためにキャッシュするが、住所データは更新される
  // ことがあるので 30 日で期限切れにして再挑戦する。
  const persisted = await pool.query<{
    town: string;
    lat: number | null;
    lon: number | null;
    not_found: boolean;
  }>(
    `SELECT town, lat, lon, not_found FROM geocode_towns
      WHERE NOT (not_found AND updated_at < now() - interval '30 days')`,
  );
  for (const r of persisted.rows) {
    townCache.set(
      r.town,
      r.not_found || r.lat === null || r.lon === null
        ? { kind: "not_found" }
        : { kind: "ok", point: { lat: r.lat, lon: r.lon } },
    );
  }
  console.log(`Persistent town cache: ${townCache.size} towns loaded.`);
}

/** この実行で引いた回数と、キャッシュに載っている町丁目の数。ログ用。 */
export function geocodeStats(): { towns: number; gsiCalls: number } {
  return { towns: townCache.size, gsiCalls };
}
