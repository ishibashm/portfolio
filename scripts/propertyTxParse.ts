/**
 * 国土交通省「不動産情報ライブラリ」の取引価格情報（XIT001）を読む部分。
 *
 * 取り込み本体（scripts/import_property_transactions.ts）から切り出して
 * ある。本体は起動時に DATABASE_URL を見て走り出すので、そのままでは
 * テストから読めない。**外にも DB にも触らない部分だけ分けて、実際に
 * 動かして確かめられるようにする**（__tests__/propertyTransactionsImport
 * .test.ts は probe が返した実物の 2 件をそのまま食わせている）。
 *
 * **項目名は 2026-08-16 の probe（京都府・2025 年第 1 四半期・2,964 件）
 * で実物を確認済み。**推測ではない。
 */

/** 応答の 1 件。項目は 29 個あるが、使うのは下の toRow が読む分だけ。 */
export type RawRecord = Record<string, unknown>;

/**
 * 一覧が入っている枝を探す。**"data" 決め打ちにしない。**
 * 提供元が包みの名前を変えたときに 0 件で静かに終わるのを防ぐ。
 * 実物の包みは { status, data }（probe で確認）。
 */
export function pickRecords(json: unknown): RawRecord[] {
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

/**
 * 文字列から数だけを取り出す。
 *
 * 数はすべて文字列で来る（"18000000" / "85"）。単位の付く項目もある。
 *   BuildingYear  "2010年"      → 2010
 *   Area          "2000㎡以上"  → 2000（範囲の下限。上限は分からない）
 * どちらも probe の実物で確認した。
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const digits = v.replace(/[^0-9.-]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 空文字は「無い」として扱う。実物は欠測を "" で返す。 */
export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export interface Row {
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
 * 項目名は probe で実物を確認済み。市区町村が取れない行は捨てる
 * （どこの取引か分からないものは方位を測れない）。
 */
export function toRow(r: RawRecord, year: number, quarter: number): Row | null {
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

/** 対応づけの検査に使う主要な項目。 */
export const REQUIRED_FIELDS = [
  "MunicipalityCode",
  "Prefecture",
  "Municipality",
  "TradePrice",
] as const;

/**
 * 最初に取れた 1 件で対応づけを確かめる。
 *
 * 項目名が変わっていると、行は入るのに中身が全部 null になる。
 * **何万件も空の行を書き込む前にここで止める。**
 */
export function checkMapping(raw: RawRecord): string | null {
  const missing = REQUIRED_FIELDS.filter((f) => str(raw[f]) === null);
  if (missing.length === 0) return null;
  return (
    `応答の項目名が想定と違います（取れなかった: ${missing.join(", ")}）。\n` +
    `実際に来た項目: ${Object.keys(raw).join(", ")}\n` +
    "TX_STAGE=probe で形を見てから、toRow の対応づけを直してください。"
  );
}
