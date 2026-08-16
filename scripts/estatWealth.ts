/**
 * e-Stat の市区町村所得データを読む部分。**2 か所に同じものが書いてあった。**
 *
 * scripts/fetch_municipalities_wealth.ts（JSON に書き出す）と
 * scripts/import_municipalities_wealth.ts（DB に入れる）で、応答の読み方
 * ・集計・1 人あたり所得の出し方が丸ごと重複していた。片方だけ直すと
 * 書き出した JSON と DB の数字が食い違う。寄せる（CLAUDE.md 3 節）。
 *
 * 型は**この取り込みが実際に読む枝だけ**を写す。応答全体を型にすると、
 * e-Stat が項目を足すたびにここが古くなる（#149 の Building / RoomEntry と
 * 同じ方針）。素の JSON を型として読む箇所はこのファイル 1 つに閉じる。
 *
 * scripts は tsc の対象外（CLAUDE.md 4 節）なので、集計は
 * __tests__/estatWealth.test.ts で固定してある。
 */

/** 統計値 1 件。金額は文字列で来る。 */
export interface EstatValue {
  /** 地域コード（市区町村）。 */
  "@area": string;
  /** 分類コード。C120110 = 課税対象所得、C120120 = 納税義務者数。 */
  "@cat01": string;
  /** 値。文字列。欠測は "-" や "***" が来る。 */
  $: string;
}

/** 分類の 1 項目（地域コード → 地域名など）。 */
export interface EstatClass {
  "@code": string;
  "@name": string;
}

/** 分類の束。id が "area" のものに地域名が入っている。 */
export interface EstatClassObj {
  "@id": string;
  /** 1 件しか無いときは配列にならない。 */
  CLASS: EstatClass | EstatClass[];
}

export interface EstatStatsResponse {
  GET_STATS_DATA: {
    RESULT: { STATUS: number; ERROR_MSG?: string };
    STATISTICAL_DATA: {
      DATA_INF: { VALUE: EstatValue[] };
      CLASS_INF: { CLASS_OBJ: EstatClassObj[] };
    };
  };
}

/** 集計した 1 市区町村。 */
export interface WealthRow {
  areaCode: string;
  areaName: string;
  taxableIncomeThousandYen: number;
  taxpayersCount: number;
  /** 課税対象所得（円）。千円単位で来るので 1000 倍する。 */
  incomeYen: number;
  /** 1 人あたりの課税対象所得（円・四捨五入）。 */
  incomePerCapita: number;
}

/** 分類コード。**数字に触らない**ので定数にして 1 か所に置く。 */
const CAT_TAXABLE_INCOME = "C120110";
const CAT_TAXPAYERS = "C120120";

/**
 * 地域コード → 地域名。
 * CLASS は 1 件しか無いときに配列にならないので、両方を受ける。
 */
export function buildAreaMap(
  classObjs: EstatClassObj[],
): Record<string, string> {
  const area = classObjs.find((obj) => obj["@id"] === "area");
  if (!area) return {};
  const list = Array.isArray(area.CLASS) ? area.CLASS : [area.CLASS];
  const map: Record<string, string> = {};
  for (const c of list) map[c["@code"]] = c["@name"];
  return map;
}

/**
 * 統計値を市区町村ごとにまとめ、1 人あたりの所得を出す。
 *
 * **納税者数が 0 の行は落とす**（欠測。割ると 0 除算になる）。
 * 1 人あたりが 0 の行も落とす。元の 2 つのスクリプトと同じ扱い。
 */
export function aggregateWealth(data: EstatStatsResponse): WealthRow[] {
  const valueList = data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;
  const areaMap = buildAreaMap(
    data.GET_STATS_DATA.STATISTICAL_DATA.CLASS_INF.CLASS_OBJ,
  );

  const byArea: Record<
    string,
    {
      areaCode: string;
      areaName: string;
      taxableIncomeThousandYen: number;
      taxpayersCount: number;
    }
  > = {};

  for (const val of valueList) {
    const areaCode = val["@area"];
    const catCode = val["@cat01"];
    const value = parseFloat(val.$);

    if (!byArea[areaCode]) {
      byArea[areaCode] = {
        areaCode,
        areaName: areaMap[areaCode] || "不明",
        taxableIncomeThousandYen: 0,
        taxpayersCount: 0,
      };
    }

    if (catCode === CAT_TAXABLE_INCOME) {
      byArea[areaCode].taxableIncomeThousandYen = value;
    } else if (catCode === CAT_TAXPAYERS) {
      byArea[areaCode].taxpayersCount = value;
    }
  }

  return Object.values(byArea)
    .map((m) => {
      // 課税対象所得は千円単位。円に直す。
      const incomeYen = m.taxableIncomeThousandYen * 1000;
      const incomePerCapita =
        m.taxpayersCount > 0 ? incomeYen / m.taxpayersCount : 0;
      return {
        ...m,
        incomeYen,
        incomePerCapita: Math.round(incomePerCapita),
      };
    })
    .filter((m) => m.taxpayersCount > 0 && m.incomePerCapita > 0);
}
