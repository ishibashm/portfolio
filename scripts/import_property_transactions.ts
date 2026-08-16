import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  pickRecords,
  toRows,
  checkMapping,
  type RawRecord,
} from "./propertyTxParse";
import {
  unzipEntries,
  pickCsv,
  decode,
  parseCsv,
  stripChome,
  push,
  averagePoint,
} from "./isjParse";
import {
  prefectureCodes as isjPrefectureCodes,
  downloadPrefecture,
} from "./isjFetch";

/**
 * 不動産の成約価格を取り込む。国土交通省「不動産情報ライブラリ」の
 * 取引価格情報から、実際に売買された価格を持ってくる。
 *
 * **API キーは地価公示（scripts/import_land_prices.ts）と同じものを使う。**
 * LIBRARY_API_KEY をそのまま読む。鍵の追加は要らない。
 *
 * 3 段構え。**どれも途中で止めて再開できる。**
 *
 *   probe    応答の形を出すだけ。**書き込まない**
 *   fetch    取引を取り込む（座標は NULL）
 *   isjfill  座標が NULL の行を ISJ（位置参照情報）の一覧で一括で埋める
 *   geocode  座標が NULL の行を国土地理院で 1 件ずつ引いて埋める
 *
 * isjfill を先に回すこと。geocode は 1 件 200ms かかり、実測 50 分で
 * 16,803 件（全国 247 万件では約 147 回・120 時間）。ISJ の一覧との
 * 突き合わせなら郵便番号と同じく 1 回で大半が埋まり、漏れだけを
 * geocode が拾えばよい。
 *
 * probe を分けてあるのは、開発の環境から国交省 API へ出られず、応答の
 * 項目名をこちらで確かめられなかったため。推測で対応づけを書くと 1 回目の
 * 取り込みが黙って空振りする。
 *
 * **2026-08-16 の probe で実物を確認済み**（京都府・2025 年第 1 四半期・
 * 2,964 件）。包みは { status, data }、項目は 29 個で、想定していた
 * 対応づけと一致した。読み取りは scripts/propertyTxParse.ts に切り出して
 * あり、probe が返した実物の 2 件をそのままテストに食わせている。
 *
 * 使い方:
 *   POSTAL_STAGE 相当は TX_STAGE。既定は probe（安全側）
 *   TX_STAGE=probe   npx tsx scripts/import_property_transactions.ts
 *   TX_STAGE=fetch   npx tsx scripts/import_property_transactions.ts
 *   TX_STAGE=geocode npx tsx scripts/import_property_transactions.ts
 *
 * 環境変数
 *   TX_YEAR_FROM   取り込む最初の年。既定 2020
 *   TX_YEAR_TO     取り込む最後の年。既定は去年
 *   TX_AREA        都道府県コード（"26" など）。既定は全国
 *   TX_TIME_BUDGET_MIN  上限（分）。既定 50
 *   TX_PRICE_CLASS 価格の種類。空なら指定しない（提供元の既定に任せる）。
 *                  probe で応答が 0 件のときに試す口
 */

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const API_KEY = process.env.LIBRARY_API_KEY;
if (!API_KEY) {
  console.error("LIBRARY_API_KEY が設定されていません。");
  process.exit(1);
}

/** 取引価格情報。地価公示（XPT002）と同じ提供元の別の口。 */
const TX_ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001";

const GSI_ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

const STAGE = process.env.TX_STAGE || "probe";
const YEAR_FROM = parseInt(process.env.TX_YEAR_FROM || "2020", 10);
const YEAR_TO = parseInt(
  process.env.TX_YEAR_TO || String(new Date().getFullYear() - 1),
  10,
);
const AREA = process.env.TX_AREA || "";
const PRICE_CLASS = process.env.TX_PRICE_CLASS || "";

const TIME_BUDGET_MS =
  (parseInt(process.env.TX_TIME_BUDGET_MIN || "50", 10) || 0) * 60_000;
const STARTED_AT = Date.now();

function budgetReached(): boolean {
  return TIME_BUDGET_MS > 0 && Date.now() - STARTED_AT >= TIME_BUDGET_MS;
}

/** 都道府県コード 01〜47。area を指定しなければ全部回す。 */
function prefectureCodes(): string[] {
  if (AREA) return [AREA];
  return Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));
}

function buildUrl(year: number, quarter: number, area: string): string {
  const params = new URLSearchParams({
    year: String(year),
    quarter: String(quarter),
    area,
  });
  if (PRICE_CLASS) params.set("priceClassification", PRICE_CLASS);
  return `${TX_ENDPOINT}?${params.toString()}`;
}

/**
 * 応答をそのまま返す。**包み（data 以外の形）を probe で見たいので、
 * ここでは中身を取り出さない。**
 */
async function callApiRaw(
  year: number,
  quarter: number,
  area: string,
): Promise<{ url: string; json: unknown }> {
  const url = buildUrl(year, quarter, area);
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": API_KEY as string, Accept: "*/*" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${url}`);
  }
  return { url, json: await res.json() };
}

async function callApi(
  year: number,
  quarter: number,
  area: string,
): Promise<RawRecord[]> {
  const { json } = await callApiRaw(year, quarter, area);
  return pickRecords(json);
}

/**
 * 応答の形を出すだけ。**1 行も書き込まない。**
 *
 * 出すのは 3 つ。項目名の一覧、値の例、件数。これを見てから
 * 下の対応づけ（toRow）が正しいかを決める。
 */
async function stageProbe() {
  const area = AREA || "26"; // 既定は京都府。1 県だけで形は分かる。
  const year = YEAR_TO;
  console.log(`形を確認します: year=${year} quarter=1 area=${area}`);

  const { url, json } = await callApiRaw(year, 1, area);
  // 鍵はヘッダで送っているので、URL をそのまま出しても漏れない。
  console.log(`  叩いた口: ${url}`);

  if (json && typeof json === "object" && !Array.isArray(json)) {
    console.log(`  包みの項目: ${Object.keys(json).join(", ")}`);
  }

  const rows = pickRecords(json);
  console.log(`  件数: ${rows.length}`);
  if (rows.length === 0) {
    console.log("  0 件でした。応答をそのまま出します:");
    console.log(JSON.stringify(json, null, 2).slice(0, 2000));
    console.log(
      "\n年・県を変えるか、TX_PRICE_CLASS（01 / 02）を指定して試してください。",
    );
    return;
  }

  const keys = new Set<string>();
  for (const r of rows.slice(0, 50)) {
    for (const k of Object.keys(r)) keys.add(k);
  }
  console.log(`\n■ 項目名（先頭 50 件に出たもの）`);
  for (const k of [...keys].sort()) console.log(`  ${k}`);

  console.log(`\n■ 値の例（先頭 2 件）`);
  for (const r of rows.slice(0, 2)) {
    console.log("  " + JSON.stringify(r, null, 2).split("\n").join("\n  "));
  }

  console.log(
    "\nこの項目名を見て、scripts の toRow の対応づけを確定させてください。",
  );
}

async function stageFetch(pool: Pool) {
  let total = 0;
  let checked = false;

  for (const area of prefectureCodes()) {
    for (let year = YEAR_FROM; year <= YEAR_TO; year++) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        if (budgetReached()) {
          console.log("⏱️ 時間の上限に達しました。続きは次回に回します。");
          return total;
        }

        let raw: RawRecord[];
        try {
          raw = await callApi(year, quarter, area);
        } catch (e) {
          console.log(
            `  × ${area} ${year}Q${quarter}: ${String(e).slice(0, 80)}`,
          );
          continue;
        }
        if (raw.length === 0) continue;

        // 最初に取れた応答で対応づけを確かめる。合わなければここで止まる。
        if (!checked) {
          const problem = checkMapping(raw[0]);
          if (problem) throw new Error(problem);
          checked = true;
          console.log("対応づけの確認: OK");
        }

        // id が重ならない形でまとめて作る。同じ内容の取引には
        // 通し番号が付く（同じ INSERT に同じ id を入れない）。
        const rows = toRows(raw, year, quarter);
        if (rows.length === 0) continue;

        /*
          同じ id は上書きする。座標（lat/lon）は触らない。触ると
          geocode の成果が毎回消えていつまでも終わらない。
        */
        await pool.query(
          `INSERT INTO property_transactions
             (id, trade_year, trade_quarter, municipality_code, prefecture,
              municipality, district_name, property_type, trade_price,
              area_sqm, unit_price_sqm, building_year, structure, use_type)
           SELECT * FROM unnest(
             $1::text[], $2::int[], $3::int[], $4::text[], $5::text[],
             $6::text[], $7::text[], $8::text[], $9::bigint[],
             $10::float8[], $11::float8[], $12::int[], $13::text[], $14::text[])
           ON CONFLICT (id) DO UPDATE SET
             trade_price = EXCLUDED.trade_price,
             area_sqm = EXCLUDED.area_sqm,
             unit_price_sqm = EXCLUDED.unit_price_sqm,
             updated_at = now()`,
          [
            rows.map((r) => r.id),
            rows.map((r) => r.trade_year),
            rows.map((r) => r.trade_quarter),
            rows.map((r) => r.municipality_code),
            rows.map((r) => r.prefecture),
            rows.map((r) => r.municipality),
            rows.map((r) => r.district_name),
            rows.map((r) => r.property_type),
            rows.map((r) => r.trade_price),
            rows.map((r) => r.area_sqm),
            rows.map((r) => r.unit_price_sqm),
            rows.map((r) => r.building_year),
            rows.map((r) => r.structure),
            rows.map((r) => r.use_type),
          ],
        );
        total += rows.length;
        console.log(`  ○ ${area} ${year}Q${quarter}: ${rows.length} 件`);

        // 公共の口なので間隔を空ける。
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  return total;
}

async function lookupGsi(
  query: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      geometry?: { coordinates?: [number, number] };
    }>;
    const coords = json?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    // GeoJSON は [経度, 緯度] の順。
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function stageGeocode(pool: Pool) {
  // 住所ごとに 1 回だけ引く。同じ地区に取引が何十件も並ぶため。
  const cache = new Map<string, { lat: number; lon: number } | null>();
  let filled = 0;
  /*
    id のカーソルで前へ進める。「座標が無い行」を毎回先頭から取り直すと、
    引けなかった行が居座って前に進まない（郵便番号の取り込みと同じ）。
  */
  let cursor = "";

  while (true) {
    if (budgetReached()) {
      console.log("⏱️ 時間の上限に達しました。続きは次回に回します。");
      break;
    }

    const { rows } = await pool.query<{
      id: string;
      prefecture: string;
      municipality: string;
      district_name: string | null;
    }>(
      `SELECT id, prefecture, municipality, district_name
         FROM property_transactions
        WHERE lat IS NULL AND id > $1
        ORDER BY id
        LIMIT 500`,
      [cursor],
    );
    if (rows.length === 0) {
      console.log("🎉 この回で見る範囲の空きは埋め終わりました。");
      break;
    }

    for (const row of rows) {
      if (budgetReached()) break;
      cursor = row.id;

      const address = `${row.prefecture}${row.municipality}${row.district_name ?? ""}`;
      let point = cache.get(address);
      if (point === undefined) {
        point = await lookupGsi(address);
        cache.set(address, point);
        await new Promise((r) => setTimeout(r, 200));
      }

      if (point) {
        await pool.query(
          `UPDATE property_transactions SET lat = $2, lon = $3, updated_at = now()
            WHERE id = $1`,
          [row.id, point.lat, point.lon],
        );
        filled++;
      }
    }
    console.log(`  埋めた ${filled} 件`);
  }
}

/**
 * 座標が NULL の行を、ISJ（位置参照情報）の一覧との突き合わせで埋める。
 *
 * 鍵は 2 通り。細かいほうから当てる。
 *
 *   1. 都道府県|市区町村|地区名          （ISJ の大字町丁目そのまま）
 *   2. 都道府県|市区町村|丁目を落とした名前（成約の地区名は丁目を持たない）
 *
 * 2 は同じ鍵に複数の丁目の点が来るので平均を取る（町の代表点。
 * 実測で 92.8% の物件が市区町村中央値から 5km 以内、#333）。
 *
 * 地区名が無い行だけは市区町村の代表点で埋める。geocode 段へ回しても
 * 同じ粒度（市区町村の代表点）しか返らないため。地区名があるのに
 * 当たらなかった行は埋めず、geocode 段に残す。
 */
async function stageIsjFill(pool: Pool) {
  const exact = new Map<string, { lat: number; lon: number }>();
  const baseGroups = new Map<string, { lat: number; lon: number }[]>();
  const cityGroups = new Map<string, { lat: number; lon: number }[]>();

  let files = 0;
  // ISJ 側の県の回し方は ISJ_PREFS が決める（TX_AREA とは別）。
  for (const pref of isjPrefectureCodes()) {
    const got = await downloadPrefecture(pref);
    if (!got) continue;
    files++;

    const rows = parseCsv(decode(pickCsv(unzipEntries(got.buf)).body));
    for (const r of rows) {
      const point = { lat: r.lat, lon: r.lon };
      exact.set(`${r.pref}|${r.city}|${r.town}`, point);
      push(baseGroups, `${r.pref}|${r.city}|${stripChome(r.town)}`, point);
      push(cityGroups, `${r.pref}|${r.city}`, point);
    }
    console.log(`  ${pref}: ${rows.length} 件（累計の鍵 ${exact.size}）`);

    // 提供元に連続で当てない。zip は小さいので短くてよい。
    await new Promise((r) => setTimeout(r, 300));
  }

  if (files === 0) {
    throw new Error(
      "1 県も取得できませんでした。ISJ_STAGE=probe（import_isj_coords.ts）で置き場を確かめてください。",
    );
  }

  const base = new Map<string, { lat: number; lon: number }>();
  for (const [k, v] of baseGroups) base.set(k, averagePoint(v));
  const city = new Map<string, { lat: number; lon: number }>();
  for (const [k, v] of cityGroups) city.set(k, averagePoint(v));

  console.log(
    `\n一覧の用意ができました: そのまま ${exact.size} / 丁目落とし ${base.size} / 市区町村 ${city.size}`,
  );

  let cursor = "";
  let filled = 0;
  let missed = 0;
  const hits = { exact: 0, base: 0, city: 0 };

  while (true) {
    if (budgetReached()) {
      console.log("⏱️ 時間の上限に達しました。続きは次回に回します。");
      break;
    }

    const { rows } = await pool.query<{
      id: string;
      prefecture: string;
      municipality: string;
      district_name: string | null;
    }>(
      `SELECT id, prefecture, municipality, district_name
         FROM property_transactions
        WHERE lat IS NULL AND id > $1
        ORDER BY id
        LIMIT 5000`,
      [cursor],
    );
    if (rows.length === 0) break;

    const ids: string[] = [];
    const lats: number[] = [];
    const lons: number[] = [];

    for (const row of rows) {
      cursor = row.id;
      const key = `${row.prefecture}|${row.municipality}|${row.district_name ?? ""}`;
      let point = exact.get(key) ?? base.get(key);
      let kind: "exact" | "base" | "city" | null = point
        ? exact.has(key)
          ? "exact"
          : "base"
        : null;

      if (!point && !row.district_name) {
        point = city.get(`${row.prefecture}|${row.municipality}`);
        if (point) kind = "city";
      }

      if (!point || !kind) {
        missed++;
        continue;
      }
      hits[kind]++;
      ids.push(row.id);
      lats.push(point.lat);
      lons.push(point.lon);
    }

    if (ids.length > 0) {
      await pool.query(
        `UPDATE property_transactions AS p
            SET lat = v.lat, lon = v.lon, updated_at = now()
           FROM (SELECT unnest($1::text[]) AS id,
                        unnest($2::double precision[]) AS lat,
                        unnest($3::double precision[]) AS lon) AS v
          WHERE p.id = v.id`,
        [ids, lats, lons],
      );
      filled += ids.length;
    }
    console.log(`  埋めた ${filled} 件 / 当たらなかった ${missed} 件`);
  }

  console.log(
    `\n内訳: そのまま ${hits.exact} / 丁目落とし ${hits.base} / 市区町村 ${hits.city}`,
  );
  console.log(
    `当たらなかった ${missed} 件は、これまで通り TX_STAGE=geocode が拾います。`,
  );
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    if (STAGE === "probe") {
      await stageProbe();
      return;
    }
    if (STAGE === "fetch") {
      const n = await stageFetch(pool);
      console.log(`✅ 取り込み ${n} 件`);
    }
    if (STAGE === "isjfill") {
      await stageIsjFill(pool);
    }
    if (STAGE === "geocode") {
      await stageGeocode(pool);
    }

    const { rows } = await pool.query<{ total: string; located: string }>(
      `SELECT count(*)::text AS total, count(lat)::text AS located
         FROM property_transactions`,
    );
    console.log(
      `\n現在: ${rows[0].total} 件（座標あり ${rows[0].located} 件）`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
