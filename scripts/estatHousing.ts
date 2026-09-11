import { buildAreaMap, type EstatStatsResponse } from "./estatWealth";

/**
 * e-Stat「統計でみる市区町村のすがた」Ｈ 居住（表 0000020108）の応答を、
 * 市区町村ごとの行にまとめる。**純粋な関数だけ。**通信も DB も無い。
 *
 * 項目のコードは探索（scripts/probe_estat_housing.ts、run 34649544727）で
 * 実物を見て決めた。**数字に触らない**ので定数にして 1 か所に置く。
 *
 * 割り算（空き家率・円/㎡・月額の目安）はここではしない。元の値だけを
 * 返し、表にも元の値だけを積む（丸めた値を積むと出どころに戻れない）。
 */
export const HOUSING_TABLE_ID = "0000020108";

export const HOUSING_ITEMS = {
  /** H1100 総住宅数（戸） */
  totalDwellings: "H1100",
  /** H110202 空き家数（戸） */
  vacantDwellings: "H110202",
  /** H4104 専用住宅の 1 畳当たり家賃（円） */
  rentPerTatamiYen: "H4104",
  /** H212020 1 住宅当たり居住室の畳数（借家）（畳） */
  tatamiPerRental: "H212020",
  /** H213020 1 住宅当たり延べ面積（借家）（㎡） */
  floorAreaPerRental: "H213020",
} as const;

export type HousingItemKey = keyof typeof HOUSING_ITEMS;

export interface HousingRow {
  /** e-Stat の地域コード（5 桁。/houi/area/{code} と同じ）。 */
  areaCode: string;
  areaName: string;
  totalDwellings: number | null;
  vacantDwellings: number | null;
  rentPerTatamiYen: number | null;
  tatamiPerRental: number | null;
  floorAreaPerRental: number | null;
}

/**
 * e-Stat の値を数値にする。欠測は "-"・"***"・"X"・空文字で来るので
 * null。桁区切りのカンマは外す。0 は 0 のまま（欠測と区別する）。
 */
export function parseEstatValue(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s === "***" || s === "X" || s === "…") {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 市区町村のコードか。統計でみる市区町村のすがたは全国（00000）と
 * 都道府県（13000 のように下 3 桁が 000）も同じ表に入れて返す。
 * 方位別の集計は市区町村だけで行うので、ここで落とす。
 */
export function isMunicipalityCode(code: string): boolean {
  return /^\d{5}$/.test(code) && !code.endsWith("000");
}

const CODE_TO_KEY: Record<string, HousingItemKey> = Object.fromEntries(
  (Object.keys(HOUSING_ITEMS) as HousingItemKey[]).map((k) => [
    HOUSING_ITEMS[k],
    k,
  ]),
) as Record<string, HousingItemKey>;

/**
 * 応答を市区町村ごとの行にまとめる。
 *
 * - 全国・都道府県の行は落とす（isMunicipalityCode）
 * - 5 項目が全部欠測の市区町村は落とす（町村は住調の対象外のことがある。
 *   行を作っても何も読めない）
 * - 知らない項目コードは無視する（cdCat01 を絞って取るので来ないはず
 *   だが、来ても壊れない）
 */
export function aggregateHousing(data: EstatStatsResponse): HousingRow[] {
  const values = data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;
  const areaMap = buildAreaMap(
    data.GET_STATS_DATA.STATISTICAL_DATA.CLASS_INF.CLASS_OBJ,
  );
  const byArea = new Map<string, HousingRow>();

  for (const v of values) {
    const areaCode = v["@area"];
    if (!isMunicipalityCode(areaCode)) continue;
    const key = CODE_TO_KEY[v["@cat01"]];
    if (!key) continue;
    let row = byArea.get(areaCode);
    if (!row) {
      row = {
        areaCode,
        areaName: areaMap[areaCode] || "不明",
        totalDwellings: null,
        vacantDwellings: null,
        rentPerTatamiYen: null,
        tatamiPerRental: null,
        floorAreaPerRental: null,
      };
      byArea.set(areaCode, row);
    }
    row[key] = parseEstatValue(v.$);
  }

  return [...byArea.values()].filter(
    (r) =>
      r.totalDwellings !== null ||
      r.vacantDwellings !== null ||
      r.rentPerTatamiYen !== null ||
      r.tatamiPerRental !== null ||
      r.floorAreaPerRental !== null,
  );
}
