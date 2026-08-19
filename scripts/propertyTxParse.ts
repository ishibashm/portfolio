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

/**
 * 積算評価で建物と土地の内訳を推定する。
 *
 * 国交省の成約データは「宅地(土地と建物)」を**総額でしか返さない**
 * （内訳は公開されていない）。そこで
 *
 *   建物推定額 = 延床面積 × 構造別の再調達単価 × 残存年数比
 *   土地推定額 = 総額 − 建物推定額
 *
 * で分解する。**推定であって実勢ではない**（列名の est_ はそのため）。
 *
 * ## 単価と耐用年数の出どころ
 *
 * 再調達単価は金融機関の積算評価で慣例的に使われる目安
 * （RC 20万/㎡・鉄骨 18万/㎡・軽量鉄骨 15万/㎡・木造 15万/㎡）。
 * 耐用年数は減価償却の法定耐用年数（住宅用）:
 * RC/SRC 47年・鉄骨(重量) 34年・鉄骨(軽量) 27年・木造 22年。
 * https://www.keisan.nta.go.jp/ の耐用年数表に基づく。
 *
 * ## 残存 0 でも建物価値を 0 にしない
 *
 * 法定耐用年数を過ぎた建物も市場では値が付く（住めるかどうかと
 * 償却は別）。最低 2 割を残す。ここを 0 にすると「築古だが設備の
 * しっかりした家」が全部 land 100% になり、この機能の目的
 * （建物がしっかりしているものを探す）と矛盾する。
 */
const STRUCTURE_TABLE: [RegExp, { unitPrice: number; life: number }][] = [
  // 順序が大事。「ＲＣ、木造」のような複合表記は先に書いたほうで決まる
  // ので、単価の高い（保守的でない）ほうを先に置かない。
  [/ＳＲＣ|SRC/, { unitPrice: 200_000, life: 47 }],
  [/ＲＣ|RC/, { unitPrice: 200_000, life: 47 }],
  [/軽量鉄骨/, { unitPrice: 150_000, life: 27 }],
  [/鉄骨/, { unitPrice: 180_000, life: 34 }],
  [/木造/, { unitPrice: 150_000, life: 22 }],
  [/ブロック|その他/, { unitPrice: 150_000, life: 22 }],
];

/** 法定耐用年数を過ぎても残す割合。 */
const MIN_REMAINING_RATIO = 0.2;

/*
  延床のもっともらしい上限。国交省の応答は面積の文字列を「2000㎡以上」で
  頭打ちにする（上の toNumber の注記）ので、2000 を超える数値が来ること
  自体が正規の経路ではあり得ない。実際、全国監査（run 32274278035）で
  岩沼市の 1 件に延床 9999㎡（総額 3 億）が見つかり、建物 3 億・土地 0 と
  推定されていた。異常値から作った推定は残さず NULL にする。
*/
const MAX_PLAUSIBLE_FLOOR_SQM = 2000;

export interface BuildingSplit {
  estBuildingPrice: number;
  estLandPrice: number;
  buildingRatio: number;
}

/**
 * 内訳を推定する。要る項目が欠けていれば null（NULL のまま残す）。
 *
 * 対象は「宅地(土地と建物)」だけ。土地だけ・マンション（区分所有は
 * 敷地権が按分で、この式では分けられない）は対象外。
 */
export function estimateBuildingSplit(row: {
  property_type: string | null;
  trade_price: number | null;
  trade_year: number;
  total_floor_area_sqm: number | null;
  building_year: number | null;
  structure: string | null;
}): BuildingSplit | null {
  if (row.property_type !== "宅地(土地と建物)") return null;
  const price = row.trade_price;
  const floor = row.total_floor_area_sqm;
  const built = row.building_year;
  if (!price || price <= 0 || !floor || floor <= 0 || !built) return null;
  if (floor > MAX_PLAUSIBLE_FLOOR_SQM) return null;
  if (!row.structure) return null;

  const entry = STRUCTURE_TABLE.find(([re]) => re.test(row.structure!));
  if (!entry) return null;
  const { unitPrice, life } = entry[1];

  const age = Math.max(0, row.trade_year - built);
  const remaining = Math.max(MIN_REMAINING_RATIO, (life - age) / life);
  const rawBuilding = Math.round(floor * unitPrice * remaining);

  // 建物の積算が総額を超えることがある（安値の取引・広い延床）。
  // 土地を負にしないよう総額で頭打ちにする。ratio 1.0 は
  // 「総額のすべてが建物」＝土地の値が付いていない取引として読める。
  const estBuildingPrice = Math.min(rawBuilding, price);
  const estLandPrice = price - estBuildingPrice;
  return {
    estBuildingPrice,
    estLandPrice,
    buildingRatio: estBuildingPrice / price,
  };
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
  total_floor_area_sqm: number | null;
  est_building_price: number | null;
  est_land_price: number | null;
  building_ratio: number | null;
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
    国交省の応答に安定した id が無いので、こちらで鍵を作る。

    最初は「市区町村・地区・種類・面積・価格・期」だけで作っていた。
    **同じ町で同じ広さ・同じ価格の取引が同じ四半期に 2 件あると潰れる。**
    京都府の 1 回目の取り込みで実際に起きて、PostgreSQL が
    「ON CONFLICT DO UPDATE command cannot affect row a second time」
    で落ちた（同じ INSERT に同じ id が 2 つあると拒む）。

    区別に使える項目を増やす。それでも同じになる行は残るので、
    通し番号を付けるのは呼び出し側（toRows）が受け持つ。
    **落とさない。**同じ条件の取引が複数あること自体が相場の情報なので、
    重複として捨てると件数が減って平均がずれる。
  */
  const id = [
    municipalityCode,
    district ?? "",
    type ?? "",
    area ?? "",
    price ?? "",
    toNumber(r.TotalFloorArea) ?? "",
    toNumber(r.BuildingYear) ?? "",
    str(r.Structure) ?? "",
    str(r.Use) ?? "",
    str(r.Region) ?? "",
    year,
    quarter,
  ].join("|");

  const row: Row = {
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
    total_floor_area_sqm: toNumber(r.TotalFloorArea),
    // 下で埋める。先に組み立てるのは estimate が Row の項目を読むため。
    est_building_price: null,
    est_land_price: null,
    building_ratio: null,
  };

  const split = estimateBuildingSplit(row);
  if (split) {
    row.est_building_price = split.estBuildingPrice;
    row.est_land_price = split.estLandPrice;
    row.building_ratio = split.buildingRatio;
  }
  return row;
}

/**
 * 応答をまとめて行にする。**id が重ならないことを保証する。**
 *
 * 項目を増やしても、まったく同じ内容の取引は残る（同じ町で同じ間取り・
 * 同じ価格の部屋が同じ四半期に 2 つ売れる、など普通にある）。そこには
 * 通し番号を付けて別の行にする。
 *
 * 捨てない。**同じ条件の取引が複数あること自体が相場の情報**で、
 * 重複として落とすと件数が減って平均がずれる。
 *
 * 番号は「応答に出てきた順」で決まる。同じ年・四半期・県を引き直せば
 * 同じ並びが返るので、**二度回しても同じ id になり、行は増えない。**
 */
export function toRows(
  records: RawRecord[],
  year: number,
  quarter: number,
): Row[] {
  const seen = new Map<string, number>();
  const rows: Row[] = [];

  for (const r of records) {
    const row = toRow(r, year, quarter);
    if (!row) continue;

    const n = (seen.get(row.id) ?? 0) + 1;
    seen.set(row.id, n);
    // 1 件目はそのまま。2 件目以降だけ番号を足して、既存の id を変えない。
    rows.push(n === 1 ? row : { ...row, id: `${row.id}#${n}` });
  }

  return rows;
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
