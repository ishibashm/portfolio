import type { MunicipalityPoint } from "@/lib/municipalityCoords";

/**
 * 住所の文字列から市区町村を引く。**外へは何も送らない**（手元の
 * `municipalityCoords.json` の表を引くだけ）。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-29）
 *
 * メールから取り込んだ物件を地図にピンで出したい。取り込みの地図は
 * 国土地理院の住所検索（`LISTING_CANDIDATE_GSI_ENABLED`）で番地まで
 * 引くが、この旗が OFF だと「地図表示は準備中です」で**1 本もピンが
 * 立たない。**旗は外部への送信を伴うので既定 OFF にしてある。
 *
 * 市区町村の代表点なら手元の表で出せる。番地までの位置ではないので、
 * 呼ぶ側は「市区町村の代表点」と断って出す。
 *
 * ## 規則
 *
 * - 先頭の都道府県名があれば、その県の中だけを見る
 * - 県の後ろ（無ければ先頭）が市区町村名で**始まる**ものを探し、
 *   いちばん長く一致したものを採る（「札幌市中央区」を「札幌市」より先に）
 * - 郡の名は書かれないことがある（「北海道倶知安町」）ので、表の
 *   「虻田郡倶知安町」は郡を外した形でも照らす
 * - ヶ／ケ、ヵ／カの揺れは同じ字として照らす（鎌ケ谷市・鎌ヶ谷市）
 * - **県が無く、同じ長さで別の市区町村に当たったら引かない。**
 *   「府中市」は東京都と広島県にある。当てずっぽうで片方に立てると、
 *   別の県の位置で方位を出すことになる
 */

const PREF_RE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/;

function fold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/ヵ/g, "カ");
}

function namesOf(p: MunicipalityPoint): string[] {
  const city = fold(p.city);
  const withoutCounty = city.replace(/^.+?郡/, "");
  return withoutCounty !== city ? [city, withoutCounty] : [city];
}

export function municipalityFromAddress(
  address: string,
  points: readonly MunicipalityPoint[],
): MunicipalityPoint | null {
  const a = fold(address);
  const pref = a.match(PREF_RE)?.[1];
  const rest = pref ? a.slice(pref.length) : a;
  if (!rest) return null;

  let best: MunicipalityPoint | null = null;
  let bestLen = 0;
  let ambiguous = false;
  for (const p of points) {
    if (pref && fold(p.pref) !== pref) continue;
    for (const name of namesOf(p)) {
      if (!name || !rest.startsWith(name)) continue;
      if (name.length > bestLen) {
        best = p;
        bestLen = name.length;
        ambiguous = false;
      } else if (name.length === bestLen && best && best.code !== p.code) {
        ambiguous = true;
      }
    }
  }
  return best && !ambiguous ? best : null;
}
