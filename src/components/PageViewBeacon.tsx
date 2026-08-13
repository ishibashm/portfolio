"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * ページ閲覧を /api/metrics/view へ 1 発送る。画面には何も描かない。
 *
 * App Router の遷移はページを読み直さないので、サーバ側だけでは
 * 「どのページが見られたか」が取れない。usePathname の変化を
 * 閲覧 1 回と数える。
 *
 * sendBeacon を使うのは、離脱の直前でも送信が生き残り、応答を
 * 待たない（計測がページを遅くしない）ため。使えない環境では
 * keepalive 付きの fetch に落とす。
 *
 * 送るのはパスと参照元だけ。クッキーも localStorage も使わない。
 * 失敗しても何もしない。計測のために画面を壊さない。
 */
export function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const body = JSON.stringify({
      path: pathname,
      referrer: document.referrer,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/metrics/view", body);
      } else {
        fetch("/api/metrics/view", { method: "POST", body, keepalive: true });
      }
    } catch {
      /* 計測の失敗で画面を壊さない */
    }
  }, [pathname]);

  return null;
}
