"use client";

import { useEffect } from "react";

/** トップページのスクロール制御だけをクライアントで実行する。 */
export function ScrollReset() {
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
