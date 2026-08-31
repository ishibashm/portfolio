/**
 * 全国の市区町村の代表点。**掲載の有無と無関係な母集団。**
 *
 * `areaContent.AREAS`（areaDirections.json）は賃貸の掲載を集計できた
 * 市区町村だけで、全国 1,917 のうち 1,119 しか無い。そのため
 * 「その方位に候補が無い」は言えても、**海や山で本当に行き止まりなのか、
 * 掲載が無いだけなのかを区別できなかった。**その区別が無いまま
 * 「行き止まり」と書いていたのが #832〜#834 の不具合で、実際に外れて
 * いた（長崎市の西に五島市、釧路町の東に厚岸町・根室市）。
 *
 * この表は区別のためだけに使う。**方位の判定や一覧の並びには使わない。**
 * 座標の作り方が areaDirections と違う（下記）ので、混ぜると答えが動く。
 *
 * ## 中身
 *
 * `src/data/municipalityCoords.json`（生成は
 * `scripts/build_municipality_coords.ts`。出典は geolonia/japanese-addresses）。
 * 市区町村コードごとに、大字・町丁目の緯度経度を平均したもの。
 *
 * areaDirections 側は**掲載のある物件の緯度経度の平均**なので、同じ
 * 市区町村でも点がずれる。実測で中央 1.0km・95% 4.9km・最大 13.7km
 * （幕別町。掲載が市の一角に固まっている）。方位を分けるには十分細かい。
 *
 * ## 入っていないもの（実測 1,894 / JIS 1,917）
 *
 * - **政令市の親コード 20 件**（01100 札幌市など）… 区の側が入っている
 *   ので、二重に数えないためむしろ入っていないのが正しい
 * - **北方領土 6 村**（01695〜01700）… 引越し先にならない
 * - **利島村（13362）・湯前町（43506）** … 出典に地点が無い。この 2 件
 *   だけは、その方位に他が 1 つも無いときに「無い」と答えてしまう
 * - **浜松市の 3 区（22138〜22140）** … 2024 年の再編後で出典が古い。
 *   areaDirections には入っているので、下の `ALL_MUNICIPALITIES` で
 *   合流させている
 */
import raw from "@/data/municipalityCoords.json";
import { AREAS } from "@/lib/areaContent";

export interface MunicipalityPoint {
  code: string;
  pref: string;
  city: string;
  lat: number;
  lon: number;
}

const dataset = raw as {
  generatedAt: string;
  source: string;
  areas: MunicipalityPoint[];
};

export const MUNICIPALITY_COORDS_SOURCE: string = dataset.source;

/**
 * 全国の市区町村。出典に無いものは areaDirections 側で補う。
 *
 * 補いが要るのは浜松市の 3 区（2024 年の再編）だけだが、出典が古く
 * なったときに黙って落ちないよう、**合流そのものを規則にしてある。**
 */
export const ALL_MUNICIPALITIES: MunicipalityPoint[] = (() => {
  const byCode = new Map<string, MunicipalityPoint>();
  for (const a of dataset.areas) byCode.set(a.code, a);
  for (const a of AREAS) {
    if (byCode.has(a.code)) continue;
    byCode.set(a.code, {
      code: a.code,
      pref: a.pref,
      city: a.city,
      lat: a.lat,
      lon: a.lon,
    });
  }
  return [...byCode.values()].sort((x, y) => x.code.localeCompare(y.code));
})();
