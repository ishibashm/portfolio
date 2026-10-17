"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 画面に入ったら一度だけ data-inview="true" を付ける器。
 * CSS 側（motion-sweep など）はこの属性が付いたときだけ動く。
 * JS が無い・IntersectionObserver が無いときは何も起きず、中身は普通に見える。
 */
export function InViewOnce({
  as: Tag = "span",
  className = "",
  children,
}: {
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      className={className}
      data-inview={inView ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}
