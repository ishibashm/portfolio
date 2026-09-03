"use client";

import { useEffect } from "react";

/**
 * 明朝体（Shippori Mincho）の @font-face を、最初の描画を止めずに読む。
 *
 * layout.tsx で next/font を呼ぶと、その CSS（gzip 62 KB）が全頁の
 * 描画を止める stylesheet に入る。ここでは hydration 後に
 * `lib/serifFont` を `import()` して、届いた時点で next/font が作る
 * 変数クラス（`--font-shippori-mincho` を定義する）を body に付ける。
 *
 * それまでの見え方は globals.css の既定（端末の明朝体）。届いたら
 * 入れ替わる。preload を切ってあるので、以前も文字が出てから
 * フォントが届くまでは同じ入れ替わりが起きていた。
 *
 * 読み始めは idle まで待つ。描画直後は地図と判定の JS が落ちてくる
 * ところで、そこにフォントの CSS と実体（見出しの文字ぶんで 100 KB
 * 前後）が最優先で割り込むと、操作できるまでが遅れる（遅い回線の
 * 実測で 2 秒ぶん）。
 */
export function SerifFontLoader() {
  useEffect(() => {
    let alive = true;
    const load = () => {
      import("@/lib/serifFont").then(({ shipporiMincho }) => {
        if (alive) document.body.classList.add(shipporiMincho.variable);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => {
        alive = false;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(load, 1);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, []);
  return null;
}
