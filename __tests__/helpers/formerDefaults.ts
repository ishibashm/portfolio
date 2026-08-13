/**
 * かつて既定値として置かれていた、運営者の個人情報。
 *
 * 「戻ってきていないか」を見張るには値そのものが要る。ただしここは公開
 * リポジトリなので、平文で書くと消した意味が薄れる（検索やスクレイプの
 * 的になる）。組み立ててから使う。見張り以外の用途で読まないこと。
 *
 * **git の履歴には平文で残っている。** ここを消しても履歴からは消えない。
 * 履歴を書き換えるしか消す方法は無く、既に公開されているので取り返しは
 * 付かない。ここでやっているのは「これ以上増やさない」ことと「今の
 * コードから読めなくする」ことの 2 つだけ。
 *
 * 経緯:
 *   #202 #208  物件スキャナーの生年月日
 *   #221       シミュレータ・時期ヒートマップ
 *   #223       /api/nba・天地人マトリクス
 *   #225       移動履歴
 *   本 PR      出生地座標と、テストの検証データ
 */

/** 生年月日（YYYY-MM-DD）。 */
export const FORMER_BIRTH_DATE = ["1988", "11", "25"].join("-");

/** 生年月日＋出生時刻。既定値はこの形で置かれていた。 */
export const FORMER_BIRTH_DATETIME = `${FORMER_BIRTH_DATE}T04:26`;

/** 出生地の緯度（文字列。state に入っていた形）。 */
export const FORMER_BIRTH_LAT = (34 + 0.3952).toFixed(4);

/** 出生地の経度。 */
export const FORMER_BIRTH_LON = (132 + 0.4482).toFixed(4);

/** 現住所の緯度。シミュレータの例に入っていた。 */
export const FORMER_BASE_LAT = (34 + 0.9911).toFixed(4);

/** 現住所の町丁名。ここでも平文にしない。 */
export const FORMER_BASE_AREA = ["西", "京", "極"].join("");

/** 現住所の経度。 */
export const FORMER_BASE_LON = (135 + 0.7248).toFixed(4);

/**
 * ソースの中に、その値が**文字列リテラルとして**書かれていないか。
 *
 * 経緯を説明するコメントは引用符の外にあるので当たらない。当たったものを
 * 返すので、落ちたときにどこが残っているか分かる。
 */
export function stringLiteralsContaining(src: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`["'\`][^"'\`\\n]*${escaped}[^"'\`\\n]*["'\`]`, "g");
  return [...src.matchAll(re)].map((m) => m[0]);
}
