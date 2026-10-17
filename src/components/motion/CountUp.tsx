"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./reducedMotion";

/**
 * 数字のカウントアップ（motion-prompt の「カウントアップ」#007 に倣う）。
 *
 * - **操作のあとに出る数字にだけ使う。**サーバで描かれた数字に使うと、
 *   最終値 → 0 → 最終値 とちらつく。
 * - 最終値を最初から DOM に持ち、動かすのは画面に入ってからの約 1.2 秒だけ。
 *   prefers-reduced-motion・IntersectionObserver なし・matchMedia なし
 *   （テスト環境を含む）では最終値のまま動かさない。
 * - 桁数分の幅を先に取り、等幅数字で右揃えにするので横に揺れない（CLS なし）。
 */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function CountUp({
  value,
  durationMs = 1200,
  className = "",
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (
      !el ||
      prefersReducedMotion() ||
      typeof IntersectionObserver === "undefined" ||
      typeof requestAnimationFrame === "undefined"
    ) {
      setShown(value);
      return;
    }
    const start = from.current;
    setShown(start);
    setBusy(true);
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / durationMs);
        const eased = 1 - Math.pow(1 - p, 4); // 最初は速く、最後はゆっくり
        setShown(Math.round(start + (value - start) * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
        else setBusy(false);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      from.current = value;
      setBusy(false);
    };
  }, [value, durationMs]);

  return (
    <span
      ref={ref}
      aria-busy={busy || undefined}
      className={`inline-block text-right tabular-nums ${className}`}
      style={{ minWidth: `${String(value).length}ch` }}
    >
      {shown}
    </span>
  );
}
