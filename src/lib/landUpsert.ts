import { dedupeByUrl } from "./rentalUpsert";

/**
 * 売地（land_listings）の 1 行と、それをまとめて書く UPSERT。
 *
 * 賃貸の rentalUpsert.ts と同じ形。違うのは欄だけで、書き方（url で
 * 重複を除いて 1 文にまとめ、`ON CONFLICT (url)` で更新）は揃えてある。
 *
 * 欄の由来は 2026-09-10 の下見（docs/improvement-backlog.md 25 節）。
 * nifty の売地一覧は `price` / `landArea` / `plotRatio` / `groupId` を
 * 文字列で持ち、**書式が出どころ（SUUMO・アットホームなど）で違う。**
 * ここの parse* はその揺れを吸収する。読めなければ null（0 にしない。
 * 「読めなかった」と「0 円」の区別が消える）。
 */

export interface LandUpsertRow {
  url: string;
  group_id: string | null;
  address: string | null;
  price: number | null;
  land_area_sqm: number | null;
  price_per_sqm: number | null;
  plot_ratio_text: string | null;
  access: string | null;
  municipality_key: string | null;
  source_scraper: string;
  expire_date: Date | null;
}

/**
 * 価格の文字列を円にする。
 *
 *     "1億5980万円"  → 159,800,000
 *     "15,980万円"   → 159,800,000   （同じ土地を別の出どころがこう書く）
 *     "1.5億円"      → 150,000,000
 *     "980万円"      →   9,800,000
 *     "-" / "相談"   → null
 *
 * 億・万・円の位を別々に読んで足す。カンマは位取りなので落とす。
 * 安全側に倒して、数字が 1 つも読めなければ null。
 */
export function parseLandPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/[,，\s]/g, "");
  if (!/\d/.test(s)) return null;
  let total = 0;
  let matched = false;
  const oku = s.match(/([\d.]+)億/);
  if (oku) {
    total += parseFloat(oku[1]) * 100_000_000;
    matched = true;
  }
  const man = s.match(/(?:億)?([\d.]+)万/);
  if (man) {
    total += parseFloat(man[1]) * 10_000;
    matched = true;
  }
  /* "…万5000円" のように万の下に円の端数が付く形。万も億も無い
     "5000000円" は円そのもの */
  const yen = s.match(/(?:万|億)?(\d+)円/);
  if (yen && !oku && !man) {
    total += parseInt(yen[1], 10);
    matched = true;
  } else if (yen && /[万億]\d+円/.test(s)) {
    total += parseInt(yen[1], 10);
  }
  if (!matched || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(total);
}

/**
 * 土地面積の文字列を ㎡ にする。先頭の数値を取る。
 *
 *     "44.33㎡（13.40坪）（実測）" → 44.33
 *     "44.33m&sup2;"              → 44.33   （HTML 実体のまま来る）
 *     "-"                         → null
 */
export function parseLandArea(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/[,，]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 円/㎡。どちらかが無ければ null。 */
export function pricePerSqm(
  price: number | null,
  areaSqm: number | null,
): number | null {
  if (price === null || areaSqm === null || areaSqm <= 0) return null;
  return Math.round(price / areaSqm);
}

/**
 * 住所から県＋市区町村（"東京都港区"）を切り出す。
 *
 * rental_properties は DB のトリガー
 * （prisma/sql/20260814_add_rental_dedupe_keys.sql）が同じ規則で埋めて
 * いる。売地はトリガーを置かず、書く側で同じ規則を通す。**規則を変える
 * ときは両方を揃えること。**
 */
export function municipalityKeyFromAddress(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  const pref = address.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/);
  if (!pref) return null;
  const rest = address.slice(pref[1].length);
  const city = rest.match(/^(.+?市.+?区)/) ?? rest.match(/^(.+?[市区町村])/);
  if (!city) return null;
  return pref[1] + city[1];
}

/**
 * nifty の url は相対（"/tochi/tokyo/minatoku_ct/suumof_123/"）と、
 * 外部サイトへ直接飛ぶ絶対 URL（"https://www.pitat.com/…"）が混ざる。
 * 相対だけをホストで補う。
 */
export function absoluteNiftyUrl(url: string): string {
  return url.startsWith("http") ? url : `https://myhome.nifty.com${url}`;
}

const UPDATED_COLUMNS = [
  "group_id",
  "address",
  "price",
  "land_area_sqm",
  "price_per_sqm",
  "plot_ratio_text",
  "access",
  "municipality_key",
  "expire_date",
  "last_seen_at",
] as const;

const COLUMN_CASTS = [
  "text", // group_id
  "text", // address
  "bigint", // price
  "numeric", // land_area_sqm
  "int", // price_per_sqm
  "text", // plot_ratio_text
  "text", // access
  "text", // municipality_key
  "timestamptz", // expire_date
  "text", // url
  "text", // source_scraper
  "timestamptz", // first_seen_at
  "timestamptz", // last_seen_at
] as const;

export interface LandUpsertStatement {
  sql: string;
  params: unknown[];
}

export function buildLandUpsert(
  rows: LandUpsertRow[],
  now: Date,
): LandUpsertStatement | null {
  const unique = dedupeByUrl(rows);
  if (unique.length === 0) return null;

  const params: unknown[] = [];
  const tuples = unique.map((row) => {
    const values = [
      row.group_id,
      row.address,
      row.price,
      row.land_area_sqm,
      row.price_per_sqm,
      row.plot_ratio_text,
      row.access,
      row.municipality_key,
      row.expire_date,
      row.url,
      row.source_scraper,
      now,
      now,
    ];
    const placeholders = values.map((value, i) => {
      params.push(value);
      return `$${params.length}::${COLUMN_CASTS[i]}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  const sql = `INSERT INTO land_listings
  (group_id, address, price, land_area_sqm, price_per_sqm, plot_ratio_text,
   access, municipality_key, expire_date, url, source_scraper,
   first_seen_at, last_seen_at)
VALUES ${tuples.join(", ")}
ON CONFLICT (url) DO UPDATE SET
  ${UPDATED_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n  ")}`;

  return { sql, params };
}
