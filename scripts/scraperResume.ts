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

/** ステートファイルを読む。壊れていても落とさず空を返す。 */
function readStateFile(stateFile: string): Record<string, unknown> {
  try {
    if (fs.existsSync(stateFile)) {
      const parsed = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    }
  } catch {
    console.warn("再開位置のファイルが読めなかった。空として扱う。");
  }
  return {};
}

/**
 * 一巡の完了を記録する。**unlink しないこと。**
 * ファイルが無いと CI がキャッシュを保存せず、古い再開位置が残る。
 *
 * 再開位置だけを空に戻し、**それ以外の鍵は残す**（knownCityCounts は
 * 一巡をまたいで覚えていないと、部分取得の検出ができない）。
 */
export function writeSweptState(stateFile: string): void {
  try {
    const kept = readStateFile(stateFile);
    delete kept.pref;
    delete kept.city;
    delete kept.cityIndex;
    delete kept.page;
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ...kept, ...RESET_STATE }, null, 2),
    );
  } catch (e) {
    console.error("Failed to reset resume state:", e);
  }
}

/**
 * 前に見えた市区町村の数。県ごとに覚える。
 *
 * 一覧は都道府県トップページのリンクから作っており、**取得が
 * 部分的になることがある。**2026-08-25 の北海道は 10 件しか取れて
 * いなかったが、DB は同じ道で 125 市区町村を知っている（2026-08-26 の
 * 実測）。`cities.length > 0` なら受け入れる作りなので、部分的な一覧の
 * まま「成功」し、その日はその範囲しか回らない。
 */
export function readKnownCityCount(stateFile: string, pref: string): number {
  const counts = readStateFile(stateFile).knownCityCounts;
  if (!counts || typeof counts !== "object") return 0;
  const n = (counts as Record<string, unknown>)[pref];
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** 見えた数を覚える。**減る方向には更新しない**（下の註）。 */
export function rememberCityCount(
  stateFile: string,
  pref: string,
  count: number,
): void {
  if (!Number.isFinite(count) || count <= 0) return;
  try {
    const state = readStateFile(stateFile);
    const counts =
      state.knownCityCounts && typeof state.knownCityCounts === "object"
        ? ({ ...state.knownCityCounts } as Record<string, number>)
        : {};
    /* 最大値で持つ。部分取得を受け入れた日に上書きすると、翌日の
       比較基準がその小さい値になって検出できなくなる。掲載が本当に
       減った県は毎晩警告が出続けるが、**気付けないより警告が出るほうが
       良い**（気付いたら基準を手で直せばよい）。 */
    counts[pref] = Math.max(counts[pref] ?? 0, Math.floor(count));
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ...state, knownCityCounts: counts }, null, 2),
    );
  } catch (e) {
    console.error("Failed to remember the city count:", e);
  }
}

/**
 * 一覧の取得が部分的か。前に見えた数の半分を下回ったら疑う。
 *
 * 半分にしたのは、掲載が日々増減する幅（実測で数%）よりずっと大きく、
 * かつ「10 対 125」のような明らかな取りこぼしは必ず捕まえるため。
 */
export const PARTIAL_CITY_LIST_RATIO = 0.5;

export function cityListLooksPartial(count: number, known: number): boolean {
  if (known <= 0) return false; // 初回は比べる相手がいない
  return count < known * PARTIAL_CITY_LIST_RATIO;
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
