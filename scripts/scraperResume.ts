/**
 * 巡回の再開位置（resume state）の扱い。nifty と eheya の両方から使う。
 *
 * ## なぜ切り出したか
 *
 * 2 つのスクレイパーが**同じ不具合**を別々に持っていた。どちらも
 * 「一巡が終わったらステートファイルを消す」と書いてあり、それが
 * 再開位置を永久に固定していた。実測（2026-08-26）:
 *
 *   - CI は再開位置を actions/cache で日をまたいで引き継ぐ
 *   - キーは run_id を含むので毎回新しく、restore-keys の前方一致で
 *     **いちばん新しいものが復元される**
 *   - ところが完了時にファイルを消すと、post 手順が
 *     「Path Validation Error ... no cache is being saved」で保存を飛ばす
 *   - 新しいエントリが作られないので、**古い再開位置がいつまでも
 *     いちばん新しいまま**になり、翌日もそこから再開する
 *
 * 結果、県は毎晩「途中から末尾まで」しか回らず、その手前は二度と
 * 再訪されない。長崎は 1.2 分で終わって最終巡回が 12 日前のまま、
 * 北海道は 8 秒で 1 ページも取らずに「成功」していた。
 *
 * **消すのではなく空を書く。**そうすればキャッシュが必ず更新され、
 * 次回は先頭から回る。相手サーバーへのリクエストの間隔（2〜4 秒）にも
 * 並列数にも触らない直し方なので、負荷の掛かり方は変わらない。
 */
import * as fs from "fs";

/**
 * 再開位置なし（＝先頭から）を表す中身。
 *
 * nifty は市区町村を名前（city）で、eheya は添字（cityIndex）で持つ。
 * どちらの loadState も `parsed.X || 既定` で読むので、両方の鍵を
 * 入れておけば片方が余分でも害はなく、1 つの関数で両方を賄える。
 */
export const RESET_STATE = {
  pref: null,
  city: null,
  cityIndex: 0,
  page: 1,
} as const;

/**
 * 一巡の完了を記録する。**unlink しないこと。**
 * ファイルが無いと CI がキャッシュを保存せず、古い再開位置が残る。
 */
export function writeSweptState(stateFile: string): void {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(RESET_STATE, null, 2));
  } catch (e) {
    console.error("Failed to reset resume state:", e);
  }
}

/**
 * 保存されている市区町村が、今回取れた一覧に無いか。
 *
 * 一覧は都道府県のトップページのリンクから作っていて、日によって
 * 中身が変わる。消えた市を待ち続けると、**どれにも一致しないまま
 * 全部をスキップして 1 ページも取らずに「成功」**する。しかも 1 ページも
 * 取らなければ saveState が呼ばれず、壊れた再開位置が翌日も残る。
 * 実測で北海道が毎晩 8 秒の空振りを繰り返していた（再開位置
 * `fukagawashi` が一覧 10 件のどれとも一致しない）。
 */
export function resumeCityMissing(
  stateCity: string | null,
  cities: readonly string[],
): boolean {
  if (!stateCity) return false;
  return !cities.includes(stateCity);
}

/**
 * 保存されている添字が、今回取れた一覧の範囲外か（eheya は名前ではなく
 * 添字で再開する）。一覧が短くなると範囲外になり、for ループが 1 度も
 * 回らずに「成功」する。名前で持つ nifty と原因は同じ。
 */
export function resumeIndexOutOfRange(index: number, length: number): boolean {
  return !Number.isInteger(index) || index < 0 || index >= length;
}
