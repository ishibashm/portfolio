/**
 * 賃貸掲載の一括 upsert。**巡回の速さを、相手サーバーへの負荷を上げずに稼ぐ。**
 *
 * ## なぜ必要か（2026-08-30 の実測）
 *
 * 本番 DB を測ったら、岡山県は岡山市の掲載しか無かった（11,931 件。
 * 倉敷市・津山市などは 1 件も無い）。熊本県も熊本市だけ、鹿児島県も
 * 鹿児島市＋数町だけ。巡回ログを読むと原因ははっきりしていて、
 *
 *   Found 28 cities in okayama.               ← 一覧は取れている
 *   ⏱️ Time budget reached. Stopping at
 *      okayama/okayamashi page 89             ← 50 分すべてを岡山市で使い切る
 *
 * 1 ページ（50 件）に 20〜35 秒かかっており、その大半が**保存**だった。
 * 保存は 1 件ずつ upsert して、さらに 1 件ごとに 50ms 眠っていた。
 * 遠隔の Postgres への往復 50 回 + 2.5 秒の待機が、ページごとに乗る。
 *
 * **取得の間隔（2〜4 秒）も 1 ページの取得回数も変えずに、保存だけを
 * 1 文にまとめる。**相手サイトへの要求は 1 回も増えない。空いた時間が
 * そのまま次のページ・次の市に回る。
 *
 * ## 同じ URL が 1 つの文に 2 回入ると落ちる
 *
 * `ON CONFLICT DO UPDATE` は、同じ文の中で同じ行を 2 度更新できない
 * （`ON CONFLICT DO UPDATE command cannot affect row a second time`）。
 * 掲載一覧には同じ物件が 2 度出ることがあるので、**必ず URL で畳んでから**
 * 文を組む。後に出てきたほうを採る（新しい情報のはず）。
 */

/** 1 行ぶん。値は呼び出し側でパース済み。 */
export interface RentalUpsertRow {
  url: string;
  property_name: string;
  address: string;
  rent: number | null;
  management_fee: number | null;
  layout: string;
  size_sqm: number | null;
  building_age: number | null;
  minutes_to_station: number | null;
  floor: string;
  is_new_build: boolean;
  expire_date: Date | null;
  source_scraper: string;
}

/** URL で畳む。後勝ち。順序は最初に出てきた位置を保つ。 */
export function dedupeByUrl(rows: RentalUpsertRow[]): RentalUpsertRow[] {
  const index = new Map<string, number>();
  const out: RentalUpsertRow[] = [];
  for (const row of rows) {
    const at = index.get(row.url);
    if (at === undefined) {
      index.set(row.url, out.length);
      out.push(row);
    } else {
      out[at] = row;
    }
  }
  return out;
}

/** 更新する列。first_seen_at と source_scraper は**初回だけ**なので入れない。 */
const UPDATED_COLUMNS = [
  "property_name",
  "address",
  "rent",
  "management_fee",
  "layout",
  "size_sqm",
  "building_age",
  "minutes_to_station",
  "floor",
  "is_new_build",
  "expire_date",
  "last_seen_at",
] as const;

/** 1 行あたりの placeholder の型。順序は下の values と揃えること。 */
const COLUMN_CASTS = [
  "text", // property_name
  "text", // address
  "int", // rent
  "int", // management_fee
  "text", // layout
  "numeric", // size_sqm
  "int", // building_age
  "int", // minutes_to_station
  "text", // floor
  "boolean", // is_new_build
  "timestamptz", // expire_date
  "text", // url
  "text", // source_scraper
  "timestamptz", // first_seen_at
  "timestamptz", // last_seen_at
] as const;

export interface RentalUpsertStatement {
  sql: string;
  params: unknown[];
}

/**
 * まとめて upsert する 1 文を組む。空の配列なら null。
 *
 * `now` は呼び出し側から渡す（テストで固定できるように）。first_seen_at と
 * last_seen_at の両方に同じ値を入れるのは、1 件ずつだった頃と同じ。
 */
export function buildRentalUpsert(
  rows: RentalUpsertRow[],
  now: Date,
): RentalUpsertStatement | null {
  const unique = dedupeByUrl(rows);
  if (unique.length === 0) return null;

  const params: unknown[] = [];
  const tuples = unique.map((row) => {
    const values = [
      row.property_name,
      row.address,
      row.rent,
      row.management_fee,
      row.layout,
      row.size_sqm,
      row.building_age,
      row.minutes_to_station,
      row.floor,
      row.is_new_build,
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

  const sql = `INSERT INTO rental_properties
  (property_name, address, rent, management_fee, layout, size_sqm,
   building_age, minutes_to_station, floor, is_new_build, expire_date,
   url, source_scraper, first_seen_at, last_seen_at)
VALUES ${tuples.join(", ")}
ON CONFLICT (url) DO UPDATE SET
  ${UPDATED_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n  ")}`;

  return { sql, params };
}
