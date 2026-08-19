/**
 * 地価公示・都道府県地価調査（XPT002）の 1 地点を読む。
 *
 * ## なぜこのファイルがあるか
 *
 * import_land_prices.ts は価格の項目名を推測で並べ、当たらなければ
 * **properties の中で 1000 より大きい数値を何でも 1 つ拾う**実装だった。
 *
 * probe（run 32305342276）で実物を見たところ、推測していた 5 つの
 * 項目名（price / LandPrice / 地価 / P01 / P01_006）は**どれも存在
 * しなかった**。つまり必ず最後の手段に落ちていた。
 *
 * 応答のキーは次の順で並ぶ。数値型で 1000 を超える最初のものは
 * **point_id（地点の整理番号）**である。
 *
 *   ... front_road_width(80〜220) → u_cadastral_ja("142(㎡)")
 *       → **point_id(7008430)** → ... → last_years_price(1740000)
 *
 * 千代田区の 1 地点なら point_id = 7008430 が拾われ、「7,008,430 円/㎡」
 * として保存される。実際の当年価格は 1,970,000 円/㎡。**桁も値も違う
 * うえ、point_id は地価と何の関係もない連番**なので、これを分母に
 * 置いたコスパ指数（所得 ÷ 地価）は意味を持たない。
 *
 * ## 当年価格の項目
 *
 * 当年価格は **`u_current_years_price_ja`** に文字列で入る。
 *
 *   "1,970,000(円/㎡)"
 *
 * 数値で入っているのは `last_years_price`（**前年**価格）だけなので、
 * 「数値の項目を探す」方針では当年価格に辿り着けない。
 *
 * ## 方針
 *
 * **推測はしない。** 取れなければ null を返し、呼び出し側が件数を
 * 数えて報告する。黙って別の数字で埋めない。
 */

/** 1 地点の、こちらが使う項目だけ。応答全体は型にしない。 */
export interface LandPricePoint {
  /** 当年の価格（円/㎡）。 */
  pricePerSqm: number;
  /** 前年の価格（円/㎡）。無いこともある。 */
  lastYearPricePerSqm: number | null;
  /** 住宅地 / 商業地 など。 */
  useCategory: string | null;
  /** 「東京都千代田区富士見１丁目８番６」 */
  location: string | null;
  /** 「千代田-4」 */
  standardLotNumber: string | null;
  /** 0 = 地価公示 / 1 = 都道府県地価調査。 */
  landPriceType: number | null;
  /** 「令和7年1月1日」 */
  targetYearLabel: string | null;
}

/**
 * "1,970,000(円/㎡)" → 1970000
 *
 * カンマと単位を外し、**数字だけ**を読む。単位が付いていない・
 * 空・別の形なら null。全角数字は来ないことを probe で確認済み。
 */
export function parsePriceYenPerSqm(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const digits = raw.replace(/,/g, "").match(/^(\d+)/);
  if (!digits) return null;

  const n = Number(digits[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 文字列の項目。空文字は「無い」として null にする。 */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * GeoJSON の 1 feature を読む。当年価格が取れなければ null。
 *
 * 価格が取れない地点を 0 や前年価格で埋めないこと。埋めると
 * 「取れなかった」ことが数えられなくなる。
 */
export function toLandPricePoint(feature: {
  properties?: Record<string, unknown> | null;
}): LandPricePoint | null {
  const p = feature.properties;
  if (!p) return null;

  const pricePerSqm = parsePriceYenPerSqm(p.u_current_years_price_ja);
  if (pricePerSqm === null) return null;

  return {
    pricePerSqm,
    lastYearPricePerSqm: parsePriceYenPerSqm(p.last_years_price),
    useCategory: str(p.use_category_name_ja),
    location: str(p.location),
    standardLotNumber: str(p.standard_lot_number_ja),
    landPriceType:
      typeof p.land_price_type === "number" ? p.land_price_type : null,
    targetYearLabel: str(p.target_year_name_ja),
  };
}
