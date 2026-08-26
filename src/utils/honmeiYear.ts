import { AstroEngine } from "@/utils/ephemerisEngine";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 生年月日から本命卦に使う年を出す。**立春で切る。**
 *
 * ## なぜ fengShuiEngine から分けたか
 *
 * この関数だけが `AstroEngine`（→ lunar-javascript、約 300KB）を
 * **値として** import する。八宅の判定そのもの（`readFengShui` /
 * `fengShuiFor`）は表引きだけで暦計算を使わないのに、同じファイルに
 * いたせいで、早見表しか置かない `/houi` にまで lunar の塊が乗っていた
 * （first-load 879KB のうち 306KB。実測）。使う画面（生年月日から
 * 引く `FengShuiNote` / `DirectionTierOverview`）だけがここを import
 * する。`import type` を値の import にしない話（#553）と同じ注意。
 *
 * ## 立春で切る理由
 *
 * 1 月 1 日で切ると、2 月上旬までに生まれた人の本命卦がひとつずれる。
 * 「よく年を間違える」の実体はこれで、暦の年ではなく節年で数える。
 *
 * 立春の判定は**太陽黄経 315 度**で行う。日付表を別に持たない。
 * 年盤の切り替わりも `ephemerisEngine` の太陽黄経から出ているので、
 * ここだけ別の暦を見ると、同じ人の年盤と本命卦が食い違う年が出る。
 *
 * 日本時間で読む。`Solar.fromDate` と同じ罠（実行環境のタイムゾーンで
 * 日付が変わる）を踏まないよう、`getZonedDateTimeFields(date, 9)` を通す。
 *
 * 1〜2 月の太陽黄経は 280〜333 度の範囲にしか来ないので、315 度との
 * 大小だけで立春の前後が決まる（黄経の折り返しをまたがない）。
 * 3〜12 月は必ず立春を過ぎているので、その年をそのまま使う。
 */

/** 立春の太陽黄経。節年の始まり。 */
const LICHUN_LONGITUDE = 315;

export function honmeiYearFor(birthDate: Date): number {
  const f = getZonedDateTimeFields(birthDate, 9);
  if (f.month > 2) return f.year;
  return AstroEngine.getSolarLongitude(birthDate) < LICHUN_LONGITUDE
    ? f.year - 1
    : f.year;
}
