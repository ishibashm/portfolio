import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

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
 *   geocode  座標が NULL の行を国土地理院で引いて埋める
 *
 * probe を分けてあるのは、**開発の環境から国交省 API へ出られず、
 * 応答の項目名をこちらで確かめられないため**。推測で対応づけを書くと
 * 1 回目の取り込みが黙って空振りする。まず形を見てから決める。
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

/**
 * 応答の 1 件。**項目名は probe で実物を見てから確定させる。**
 * ここに書いてあるのは公開仕様に基づく想定で、確認前は当てにしない。
 */
type RawRecord = Record<string, unknown>;

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

/**
 * 一覧が入っている枝を探す。**"data" 決め打ちにしない。**
 * 提供元が包みの名前を変えたときに 0 件で静かに終わるのを防ぐ。
 */
function pickRecords(json: unknown): RawRecord[] {
  if (Array.isArray(json)) return json as RawRecord[];
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of ["data", "Data", "results", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as RawRecord[];
  }
  // 名前が違っても、配列の枝が 1 つだけならそれを使う。
  const arrays = Object.values(obj).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as RawRecord[]) : [];
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

/** 文字列から数だけを取り出す。「1,234万円」のような表記に備える。 */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const digits = v.replace(/[^0-9.-]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface Row {
  id: string;
  trade_year: number;
  trade_quarter: number;
  municipality_code: string;
  prefecture: string;
  municipality: string;
  district_name: string | null;
  property_type: string | null;
  trade_price: number | null;
  area_sqm: number | null;
  unit_price_sqm: number | null;
  building_year: number | null;
  structure: string | null;
  use_type: string | null;
}

/**
 * 応答の 1 件を表の 1 行にする。
 *
 * **項目名は probe で確かめてから直すこと。**下の名前は公開仕様に
 * 基づく想定で、実物と違えば全部 null になる（黙って空の行が並ぶ）。
 * そうならないよう、fetch の最初の 1 件で「主要な項目が全部 null」なら
 * 止めて知らせる（下の assertMapping）。
 */
function toRow(r: RawRecord, year: number, quarter: number): Row | null {
  const municipalityCode = str(r.MunicipalityCode);
  const prefecture = str(r.Prefecture);
  const municipality = str(r.Municipality);
  if (!municipalityCode || !prefecture || !municipality) return null;

  const price = toNumber(r.TradePrice);
  const area = toNumber(r.Area);
  const district = str(r.DistrictName);
  const type = str(r.Type);

  /*
    国交省の応答に安定した id が無い。同じ取引を二度入れないための鍵を
    こちらで作る。市区町村・地区・種類・面積・価格・期がすべて同じ行は
    同一の取引とみなす。厳密な同定ではないが、二度入れを防ぐには足りる。
  */
  const id = [
    municipalityCode,
    district ?? "",
    type ?? "",
    area ?? "",
    price ?? "",
    year,
    quarter,
  ].join("|");

  return {
    id,
    trade_year: year,
    trade_quarter: quarter,
    municipality_code: municipalityCode,
    prefecture,
    municipality,
    district_name: district,
    property_type: type,
    trade_price: price,
    area_sqm: area,
    // 割り算はここでやる。画面に置くと面積 0 の行で Infinity になる。
    unit_price_sqm:
      price !== null && area !== null && area > 0 ? price / area : null,
    building_year: toNumber(r.BuildingYear),
    structure: str(r.Structure),
    use_type: str(r.Use),
  };
}

/**
 * 対応づけが実物と合っているかを、最初の 1 件で確かめる。
 *
 * 合っていないと「行は入るが中身が全部 null」になり、**失敗したことに
 * 気付けないまま何万件も書き込む**。それを防ぐ。
 */
function assertMapping(rows: RawRecord[]) {
  const sample = rows[0];
  const mapped = toRow(sample, YEAR_TO, 1);
  if (!mapped) {
    console.error("\n応答の項目名が想定と違います。実際の 1 件:");
    console.error(JSON.stringify(sample, null, 2));
    throw new Error(
      "対応づけ（toRow）が合っていません。TX_STAGE=probe で項目名を確認し、" +
        "toRow を直してから再実行してください。",
    );
  }
  if (mapped.trade_price === null && mapped.area_sqm === null) {
    console.error("\n価格も面積も取れていません。実際の 1 件:");
    console.error(JSON.stringify(sample, null, 2));
    throw new Error("対応づけ（toRow）が合っていません。");
  }
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
          assertMapping(raw);
          checked = true;
          console.log("対応づけの確認: OK");
        }

        const rows = raw
          .map((r) => toRow(r, year, quarter))
          .filter((r): r is Row => r !== null);
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
