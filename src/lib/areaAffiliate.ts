/**
 * 市区町村ページ（/houi/area/[code]）の索引可否とアフィリエイト案件の判定。
 *
 * 固有の編集文（AREA_EDITORIAL）があり、かつ住宅・土地統計調査のデータがある
 * 市区町村ページだけを検索エンジンの索引対象（index）とする。
 * ハコブ引っ越しサービスは、索引対象の頁のうち 1 都 3 県（東京都・千葉県・
 * 埼玉県・神奈川県）の市区町村だけに掲載し、noindex の頁や対象外の道府県には出さない。
 */
import housingStats from "@/data/housingStats.json";
import { findArea } from "@/lib/areaContent";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { hakobuOfferForPref, type AffiliateOffer } from "@/lib/affiliateOffers";
import {
  hasAreaHousingData,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";

const HOUSING = housingStats as unknown as HousingSnapshotData;

/**
 * 市区町村ページが索引対象（編集文あり・住宅統計あり）かどうかを返す。
 * generateMetadata の robots 判定とアフィリエイト掲載判定で同じ条件を使う。
 */
export function isIndexedArea(
  code: string,
  snapshot: HousingSnapshotData = HOUSING,
): boolean {
  return Boolean(AREA_EDITORIAL[code]) && hasAreaHousingData(snapshot, code);
}

/**
 * 市区町村コードに対応するアフィリエイト案件を返す。
 * 索引対象かつ 1 都 3 県の市区町村のときだけハコブ引っ越しサービスを返し、
 * noindex の頁や 1 都 3 県以外の市区町村では undefined を返す。
 */
export function areaAffiliateOffer(
  code: string,
  snapshot: HousingSnapshotData = HOUSING,
): AffiliateOffer | undefined {
  const area = findArea(code);
  if (!area) return undefined;
  if (!isIndexedArea(area.code, snapshot)) return undefined;
  return hakobuOfferForPref(area.pref);
}
