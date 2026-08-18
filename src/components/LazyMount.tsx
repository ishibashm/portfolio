"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyMountProps {
  children: ReactNode;
  /** 出るまでの間の置き換え。高さを持たせて、出た瞬間のずれを小さくする。 */
  fallback?: ReactNode;
  /**
   * どれだけ手前で読み始めるか。既定は 600px（スクロールの途中で
   * 間に合わせるため、画面 1 つ弱を先取りする）。
   */
  rootMargin?: string;
}

/**
 * **画面に近づくまで中身を作らない。**
 *
 * ホームは時計（`SolarTimeClock`）を `dynamic` で読んでいるが、
 * **分割されていても、読み込んだ後は必ず実行される。**初回表示の待ち時間に
 * そのまま乗る。実測でメインスレッドの `scriptEvaluation` が 2,650ms、
 * そのうち大半が時計のハイドレートだった。
 *
 * そして時計は**初期表示に影も形も無い。**360x640 の画面で測ると、
 *
 *   viewport 高さ    640 px
 *   ページ全体      5833 px
 *   時計の開始位置  2856 px   ← 4.5 画面ぶん下
 *
 * ヘッダー → プロフィール欄 → 中核ページの札 7 枚 → 時計、の 4 番目にある。
 * **誰も見ていないものを、初回表示の前に作っていた。**
 *
 * ## 中身を隠さない
 *
 * `IntersectionObserver` が無い環境では**すぐ出す。**古いブラウザや、
 * 監視の仕組みを持たない読み取り機に対して、中身が永久に出ない形を作らない。
 *
 * 検索については、時計は元から `ssr: false` で HTML に含まれないので、
 * ここで新たに失うものは無い。
 */
export function LazyMount({
  children,
  fallback = null,
  rootMargin = "600px",
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;

    // 監視の仕組みが無ければ、待たずに出す。中身を隠さないことを優先する。
    //
    // 効果の中で同期に setShown すると連鎖描画になる
    // （react-hooks/set-state-in-effect）。次の順番に回す。
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(timer);
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, rootMargin]);

  return <div ref={ref}>{shown ? children : fallback}</div>;
}
