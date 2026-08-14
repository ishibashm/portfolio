/**
 * `/api/rentals/arbitrage` が返す物件 1 件ぶん。
 *
 * あの route は `SELECT *` に計算した列を足して返すので、rental_properties
 * の列名がそのまま出る。**`age_years` のような別名は無い。**
 *
 * ここに置く前は、同じ形が `ArbitrageMapInner`（ScoredProperty）に書かれ、
 * `SolarTimeClock` は `any[]` で受けていた。any 側で項目名を間違えても
 * 誰も気付けず、実際に総合スコアの「推奨賃貸物件」が築年数を空欄で
 * 出していた（`rental.age_years` は存在しない。正しくは `building_age`）。
 * 市区町村の所得データで起きたのと同じ形（#231・#233）。
 *
 * 載せているのは**画面が実際に読む列だけ**。応答には他にも列があるが、
 * 読まないものまで書き写すと、応答が変わったときに嘘が増える（#149）。
 */
import type { DateScore } from "@/components/realestate/AstroGridCalendar";

export interface ScoredProperty {
  id: string;
  property_name: string;
  rent: number | null;
  management_fee: number | null;
  layout: string | null;
  minutes_to_station: number | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  floor: string | null;
  /**
   * 専有面積。raw SQL の numeric なので、ドライバからは文字列で来る。
   * 計算する側は `Number()` を通している（route の `Number(p.size_sqm)`）。
   */
  size_sqm: string | number | null;
  /** 築年数。**`age_years` ではない。** */
  building_age: number | null;
  is_new_build: boolean | null;
  url: string | null;
  /** 家賃＋管理費。route が足して返す。 */
  totalRent: number;
  /** 出発地からの距離。出発地が無いときは null。 */
  distanceKm: number | null;
  /** 真北で見た方位。判定はこちらを使う。 */
  direction: string | null;
  /** 方位磁針で測ったときの方位。注意書き用で、判定には使わない。 */
  magneticDirection: string | null;
  astrologyStatus: string;
  /** ㎡単価。totalRent / size_sqm。 */
  propSqmRent: number;
  astrologyScore: number;
  isTendo?: boolean;
  maxAstroFactor?: string;
  astroFlags?: string[];
  /**
   * 対象日 ±3 日ぶんの吉凶。地図の吹き出しの暦（AstroGridCalendar）に
   * そのまま渡す。要素の形は向こうの DateScore が正。
   */
  dateScores?: DateScore[];
}
