"use client";

import { useEffect } from "react";

/**
 * 読み込み時にブラウザが下端へ自動スクロールするのを防ぐ。
 * トップページ全体を client にしないために、この処理だけを切り出した。
 */
export function ScrollTopOnMount() {
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return null;
}
