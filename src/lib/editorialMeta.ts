/**
 * 固有の文章から meta description を作る。
 *
 * 県ページ（47 頁）と市区町村ページ（索引に戻した頁）は、文章を
 * 手で書いている。ところが description は**地名だけを差し替えた
 * 同じ 1 文**を全頁に配っていた。#379 で索引から外す原因になった
 * 「地の文はどの URL でも同一」が、まさに description に残っていた
 * ことになる。
 *
 * 文章のある頁は、その 1 段落目から作る。文章の無い頁は今までどおり
 * 既定の 1 文を使う（そこは noindex のままなので影響しない）。
 *
 * **額や掲載数は入らない。**文章の側で書かない決め事になっていて、
 * prefEditorialNoAmounts の検査が守っている。
 */

/** 検索結果に出る長さの目安。全角で 60 字前後まで表示される。 */
const MAX_LENGTH = 110;

/**
 * 1 段落目を、文の切れ目で description の長さに詰める。
 *
 * 途中で切ると意味が変わる（「街が 1 つもありません」が
 * 「街が 1 つも」で終わる、など）ので、**必ず「。」で切る**。
 * 1 文目だけで長すぎるときは、その 1 文をそのまま返す。詰めるより
 * 意味が通るほうを取る。
 */
export function metaDescriptionFromIntro(
  intro: readonly string[] | undefined,
  fallback: string,
): string {
  const first = intro?.[0]?.trim();
  if (!first) return fallback;

  const sentences = first.split("。").filter((s) => s.length > 0);
  if (sentences.length === 0) return fallback;

  let out = "";
  for (const sentence of sentences) {
    const next = `${out}${sentence}。`;
    if (out && next.length > MAX_LENGTH) break;
    out = next;
  }
  return out || fallback;
}
