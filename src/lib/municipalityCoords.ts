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

/** 出典そのまま（1,894 件）。合流前なので、ふつうは下の関数を使う。 */
export const MUNICIPALITY_POINTS: MunicipalityPoint[] = dataset.areas;

/**
 * 掲載のある市区町村に、出典の側から**足りない分だけ**を加えて返す。
 *
 * **掲載側の座標を優先する。**出典の側で上書きしてはいけない。頁の
 * 一覧は掲載側の座標（掲載物件の平均）で方位を決めているので、同じ
 * 市区町村を別の点で数えると**同じ画面の中で方位が食い違う。**
 *
 * 実際に踏んだ: 石狩市は掲載側の点だと札幌市北区の**北西**（掲載が
 * 花川に固まっている）だが、出典側の点だと**北**（旧厚田・浜益を含む
 * 海岸線ぜんぶの平均なので北へ伸びる）。出典側を優先すると、一覧に
 * 北西として出ている街を根拠に「北にも街がある」と言うことになる。
 *
 * 加わるのは掲載の無い町村（実測 793 件）と、出典に無い浜松市の 3 区
 * （2024 年の再編）。
 *
 * **AREAS をここから import しない。**areaContent がこの module を
 * 読むので、逆向きに読むと循環参照になる（実際に
 * `AREAS is not iterable` で落ちた。module の評価順で、合流を実行する
 * 時点の AREAS がまだ undefined だった）。呼ぶ側から渡す。
 */
export function mergeWithListed(
  listed: readonly MunicipalityPoint[],
): MunicipalityPoint[] {
  const byCode = new Map<string, MunicipalityPoint>();
  for (const a of listed) {
    byCode.set(a.code, {
      code: a.code,
      pref: a.pref,
      city: a.city,
      lat: a.lat,
      lon: a.lon,
    });
  }
  for (const a of dataset.areas) {
    if (byCode.has(a.code)) continue;
    byCode.set(a.code, a);
  }
  return [...byCode.values()].sort((x, y) => x.code.localeCompare(y.code));
}
