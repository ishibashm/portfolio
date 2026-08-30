/**
 * 都道府県ページ（/houi/pref/[code]）の集計。
 *
 * 市区町村ページ（/houi/area/[code]、1,022 頁）は同一雛形の展開で
 * 索引から外した（noindex。#379）。その上位階層として、県単位で
 * 「固有の文章 + 実データの集計」を持つ 1 ページ 1 記事の頁を作る。
 * Search Console の実測で、表示が付いているクエリのほぼ全部が
 * 「地名 家賃相場」だった（2026-08-27）ことへの受け皿でもある。
 *
 * 数値はぜんぶ areaDirections.json（毎晩の巡回から再生成）から
 * その場で集計する。文章側（prefEditorial）には変わりうる数字を
 * 書かないこと。数字は集計が、地理の構造は文章が担当する。
 */
import raw from "@/data/areaDirections.json";
import centers from "@/data/prefectureCenters.json";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  type CompassDirection,
} from "@/lib/kigakuContent";
import type { Area } from "@/lib/areaContent";

const AREAS = (raw as { areas: Area[] }).areas;

/** 県名 → JIS 2 桁コード。市区町村コードの先頭 2 桁から引く。 */
const PREF_CODE_BY_NAME = new Map<string, string>();
for (const a of AREAS) {
  if (!PREF_CODE_BY_NAME.has(a.pref)) {
    PREF_CODE_BY_NAME.set(a.pref, a.code.slice(0, 2));
  }
}

export function prefNameByCode(code: string): string | undefined {
  for (const [name, c] of PREF_CODE_BY_NAME) {
    if (c === code) return name;
  }
  return undefined;
}

export function prefCodeByName(name: string): string | undefined {
  return PREF_CODE_BY_NAME.get(name);
}

/**
 * 地方区分（JIS 2 桁コード → 地方名）。
 *
 * 呼び名は**サイトで既に使っている `PRACTITIONER_AREAS` に合わせる**
 * （鑑定士の対応地域の選択肢）。「中部」でひとまとめにせず
 * 北陸・甲信越／東海に割るのも、三重を東海に入れるのもそちらの流儀。
 * 地方の呼び名を 2 通り持たないための決めごとで、
 * __tests__/prefRegions.test.ts が食い違ったら落ちる。
 *
 * 県ページ同士がどこにも繋がっておらず、引越し先を複数県で
 * 見比べるときに一度 /houi へ戻るしかなかった。その導線用。
 */
export const PREF_REGION: Readonly<Record<string, string>> = {
  "01": "北海道",
  "02": "東北",
  "03": "東北",
  "04": "東北",
  "05": "東北",
  "06": "東北",
  "07": "東北",
  "08": "関東",
  "09": "関東",
  "10": "関東",
  "11": "関東",
  "12": "関東",
  "13": "関東",
  "14": "関東",
  "15": "北陸・甲信越",
  "16": "北陸・甲信越",
  "17": "北陸・甲信越",
  "18": "北陸・甲信越",
  "19": "北陸・甲信越",
  "20": "北陸・甲信越",
  "21": "東海",
  "22": "東海",
  "23": "東海",
  "24": "東海",
  "25": "近畿",
  "26": "近畿",
  "27": "近畿",
  "28": "近畿",
  "29": "近畿",
  "30": "近畿",
  "31": "中国",
  "32": "中国",
  "33": "中国",
  "34": "中国",
  "35": "中国",
  "36": "四国",
  "37": "四国",
  "38": "四国",
  "39": "四国",
  "40": "九州・沖縄",
  "41": "九州・沖縄",
  "42": "九州・沖縄",
  "43": "九州・沖縄",
  "44": "九州・沖縄",
  "45": "九州・沖縄",
  "46": "九州・沖縄",
  "47": "九州・沖縄",
};

export interface PrefRef {
  code: string;
  name: string;
}

/**
 * 同じ地方の、自分以外の県（コード順）。
 *
 * 公開しているかどうかは**呼び出し側で絞る**。県ページは固有文章を
 * 書いた県だけ公開する決まりなので、ここで台帳を見に行くと
 * 地理の表と公開の判断が混ざる。
 */
export function regionSiblings(code: string): PrefRef[] {
  const region = PREF_REGION[code];
  if (!region) return [];
  return Object.keys(PREF_REGION)
    .filter((c) => c !== code && PREF_REGION[c] === region)
    .sort()
    .flatMap((c) => {
      const name = prefNameByCode(c);
      return name ? [{ code: c, name }] : [];
    });
}

export interface PrefStats {
  pref: string;
  code: string;
  /** 県の面積重心。方位の基準点（県塗りの地図と同じ規約）。 */
  center: { lat: number; lon: number };
  /** 家賃中央値の安い順。 */
  municipalities: Area[];
  totalCount: number;
  /** 市区町村の家賃中央値の、さらに中央値。 */
  medianOfMedians: number;
  /** 県の重心から見た八方位ごとの市区町村（各方位で安い順）。 */
  byDirection: { dir: CompassDirection; jp: string; areas: Area[] }[];
  asOf?: string;
}

export function getPrefStats(pref: string): PrefStats | undefined {
  const ms = AREAS.filter((a) => a.pref === pref);
  const center = (centers as Record<string, { lat: number; lon: number }>)[
    pref
  ];
  if (ms.length === 0 || !center) return undefined;

  const sorted = [...ms].sort((a, b) => a.medianRent - b.medianRent);
  const meds = sorted.map((a) => a.medianRent);
  const medianOfMedians = meds[Math.floor(meds.length / 2)];

  const byDir = new Map<CompassDirection, Area[]>();
  for (const a of ms) {
    // 判定と同じ、真北基準 + 伝統区分（四正30度・四隅60度）。
    // 実装は directionGeo の 1 か所だけを使う（3 節。新しく書かない）。
    const dir = directionFromBearing(
      bearingBetween(center.lat, center.lon, a.lat, a.lon),
      "traditional",
    );
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(a);
  }

  return {
    pref,
    code: PREF_CODE_BY_NAME.get(pref)!,
    center,
    municipalities: sorted,
    totalCount: ms.reduce((s, a) => s + a.count, 0),
    medianOfMedians,
    byDirection: DIRECTIONS.map((dir) => ({
      dir,
      jp: DIRECTION_LABELS[dir],
      areas: (byDir.get(dir) ?? []).sort((a, b) => a.medianRent - b.medianRent),
    })).filter((g) => g.areas.length > 0),
    asOf: ms[0]?.asOf,
  };
}
