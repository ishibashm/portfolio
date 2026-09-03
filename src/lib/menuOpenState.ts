/**
 * 左上のメニューが開いているかを、`<html data-menu>` で持つ。
 *
 * ## なぜ React の state ではないか
 *
 * ボタンは HTML には最初から出ているが、React が繋がる（hydration）まで
 * onClick が付かない。実測で、押しても何も起きない時間が**物件検索で
 * 4.6 秒（良い回線）・8.7 秒（遅い回線）**あった。利用者からの
 * 「反応が悪い」はこれ。
 *
 * 開閉そのものは `layout.tsx` の素のスクリプト（hydration を待たない）が
 * `<html>` の `data-menu` を切り替え、`globals.css` がそれを見て描く。
 * React はここを**読むだけ**にして、開いているかどうかの表示（aria）を
 * 合わせる。二重に切り替えないよう、**書くのは閉じるときだけ**
 * （リンクを押したとき）。
 */

export const MENU_ATTR = "data-menu";

/** 開いているか。属性が "open" のときだけ真。 */
export const menuIsOpen = () =>
  document.documentElement.getAttribute(MENU_ATTR) === "open";

/** サーバー側と、まだ何も起きていない最初の描画。 */
export const MENU_SERVER_SNAPSHOT = false;

/** 属性の変化を購読する。素のスクリプトが書き換えるので、DOM を見る。 */
export function subscribeMenu(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [MENU_ATTR],
  });
  return () => observer.disconnect();
}

/** 閉じる。開くのは素のスクリプトの担当（二重に切り替えない）。 */
export function closeMenu() {
  document.documentElement.setAttribute(MENU_ATTR, "closed");
}
