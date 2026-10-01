/**
 * 公的な民営家賃（総務省 小売物価統計調査）を、県や市区町村に当てる。
 * **純粋な関数だけ。**写し（src/data/estatRent.json）は呼ぶ側が渡す。
 *
 * 県・市区町村の頁の家賃は住宅・土地統計調査（5 年ごと）で、最新が
 * 2023 年。Search Console の実測（2026-10-01、過去 3 か月）で、表示の
 * 付く語の最大の塊は「千葉 家賃相場」「愛知 家賃」の形（40〜50 位）。
 * 毎月出る公的な値（県庁所在市と人口 15 万以上の市、81 市）を同じ頁に
 * 並べ、いつの値かを書く。
 *
 * 表の値は「借家 1 か月・3.3㎡（1 坪）あたり」の円。
 */

import type { EstatRentSnapshot, RetailRentCity } from "@/utils/estatRent";

export interface OfficialRent {
  areaCode: string;
  /** 注記（【2010年1月～…】）を外した市の名前 */
  name: string;
  /** 3.3㎡あたり月額（円） */
  yen: number;
  /** ㎡あたりの目安（円）。3.3 で割って丸めた値 */
  perSqm: number;
  /** 前年同月比（%）。前年同月が無ければ null */
  yoyPct: number | null;
}

/** 「豊橋市【2010年1月～2019年12月】【2025年1月～】」→「豊橋市」 */
export function cleanCityName(name: string): string {
  return name.replace(/【[^】]*】/g, "").trim();
}

function toOfficial(c: RetailRentCity): OfficialRent {
  return {
    areaCode: c.areaCode,
    name: cleanCityName(c.areaName),
    yen: c.yen,
    perSqm: Math.round(c.yen / 3.3),
    yoyPct:
      c.yenYearAgo && c.yenYearAgo > 0
        ? Math.round(((c.yen - c.yenYearAgo) / c.yenYearAgo) * 1000) / 10
        : null,
  };
}

/** 県（2 桁の県コード）の中の市。表の並び（市区町村コード順） */
export function officialRentsForPref(
  snapshot: EstatRentSnapshot,
  prefCode: string,
): OfficialRent[] {
  return snapshot.retail.cities
    .filter((c) => c.areaCode.slice(0, 2) === prefCode)
    .map(toOfficial);
}

/**
 * 市区町村（5 桁のコードと「〇〇市〇〇区」のような名前）に当たる市。
 *
 * - 市そのもの（柏市 12217）はコードが一致する
 * - 政令市の区（千葉市中央区 12101）は、同じ県の市で名前が前に一致する
 *   もの（千葉市 12100）。区のコードは市のコードと別の番号なので、コード
 *   だけでは引けない
 * - 東京の区部（13101〜13123）は「特別区部」（13100）
 *
 * 当たらなければ null（町村、15 万未満の市など）。
 */
export function officialRentForArea(
  snapshot: EstatRentSnapshot,
  areaCode: string,
  cityName: string,
): OfficialRent | null {
  const cities = snapshot.retail.cities;
  const exact = cities.find((c) => c.areaCode === areaCode);
  if (exact) return toOfficial(exact);
  const pref = areaCode.slice(0, 2);
  const n = Number(areaCode.slice(2));
  if (pref === "13" && n >= 101 && n <= 123) {
    const ku = cities.find((c) => c.areaCode === "13100");
    return ku ? toOfficial(ku) : null;
  }
  const ward = cities.find(
    (c) =>
      c.areaCode.slice(0, 2) === pref &&
      /^\d{2}1\d0$/.test(c.areaCode) &&
      cityName.startsWith(cleanCityName(c.areaName)),
  );
  return ward ? toOfficial(ward) : null;
}
