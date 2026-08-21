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
 * 送るのはパスと参照元、それに「この端末を計測から除外しているか」の
 * 3 つだけ。クッキーは使わない。失敗しても何もしない。計測のために
 * 画面を壊さない。
 *
 * ## 除外フラグ
 *
 * 運営者自身の閲覧が数に乗ってしまう問題への対処のうち、**端末側の
 * 半分。**サーバ側は ADMIN_EMAIL でログインしているかを見るが、
 * ログアウトして見ると効かない。この端末に印を置いておけば、ログイン
 * 状態に関係なく外せる。
 *
 * 逆に、別の端末を使えばこちらは効かない。だから 2 つ持っている。
 *
 * localStorage が使えない環境（プライベートウィンドウ、設定で保存を
 * 止めている）では読めずに例外になる。**読めなければ除外しない**に
 * 倒す。計測されるほうが、記録が欠けるより害が小さい。
 */

/** この端末を計測から除外しているか、を置く鍵。 */
export const METRICS_OPT_OUT_KEY = "cp:metrics-opt-out";

/** 除外しているか。読めないときは false（＝除外しない）。 */
export function isMetricsOptedOut(): boolean {
  try {
    return localStorage.getItem(METRICS_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const body = JSON.stringify({
      path: pathname,
      referrer: document.referrer,
      internal: isMetricsOptedOut(),
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
