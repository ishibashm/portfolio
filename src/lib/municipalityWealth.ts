/**
 * `/api/municipalities-wealth` の応答 1 件ぶん。
 *
 * 同じ形が `relocation/wealth/page.tsx`（MunicipalityWealth）と
 * `components/WealthMap.tsx`（MunicipalityData）に別々に書かれていて、
 * `SolarTimeClock.tsx` は any で受けていた。any 側で項目名を間違えて
 * いても誰も気付けず、実際に総合スコア表の「推奨エリア」が地域名を
 * 空欄・所得を NaN で出していた（#229 の続きで発見）。
 *
 * 応答は Prisma の MunicipalityWealth を丸ごと展開したうえで、方位と
 * 距離を足したもの（route.ts の `return { ...m, ... }`）。ここは
 * その形を 1 か所で持つための置き場。
 */
export interface MunicipalityWealthItem {
  id: string;
  areaCode: string;
  /** 市区町村名。表示に使うのはこれ。`municipality_name_ja` は存在しない。 */
  areaName: string;
  taxableIncomeThousandYen: number;
  taxpayersCount: number;
  incomeYen: number;
  /** 1 人あたり所得（円）。画面では 10000 で割って万円にする。 */
  incomePerCapita: number;
  lat: number | null;
  lon: number | null;
  astrologyScore: number;
  astrologyStatus: string;
  direction: string | null;
  magneticDirection?: string | null;
  trueBearing?: number | null;
  magneticBearing?: number | null;
  dataYear: string;
  landPricePerSqm?: number;
  cospaIndex?: number;
  distanceKm?: number;
}
