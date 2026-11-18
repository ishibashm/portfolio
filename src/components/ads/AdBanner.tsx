"use client";

import React, { useEffect, useRef } from "react";
import { getAdsenseIds, getAdsenseSlot } from "@/lib/adsense";

interface AdBannerProps {
  /** 広告ユニット。未指定なら記事用。 */
  unit?: "article" | "list";
  /** スロットIDを直に渡す場合（通常は環境変数から引く）。 */
  slot?: string;
  format?: "auto" | "fluid" | "rectangle" | "horizontal";
  responsive?: boolean;
  className?: string;
}

/**
 * 手動広告枠。
 *
 * ID かスロットが無いときは何も描かない。空の破線枠は審査でも利用者でも
 * 「作りかけ」に見えるため出さない。自動広告だけにする場合は、この部品は使わない。
 *
 * 描くときは高さを先に確保する（中くらいのレクタングル 250px）。
 * 広告が後から入っても、本文が下へ飛ばない。
 * push は枠が画面の近くに来てから行う。折り目の下の枠が初期表示を止めない。
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  unit = "article",
  slot,
  format = "auto",
  responsive = true,
  className = "",
}) => {
  const ids = getAdsenseIds();
  const resolvedSlot = slot ?? getAdsenseSlot(unit);
  const pushed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!ids || !resolvedSlot || !el) return;
    const push = () => {
      if (pushed.current) return;
      pushed.current = true;
      try {
        const queue = window.adsbygoogle ?? [];
        window.adsbygoogle = queue;
        queue.push({});
      } catch (err) {
        console.warn("AdSense push error:", err);
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      push();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          push();
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ids, resolvedSlot]);

  if (!ids || !resolvedSlot) return null;

  return (
    <div
      ref={rootRef}
      className={`my-4 w-full overflow-hidden ${className}`}
      style={{ minHeight: 250 }}
      aria-label="スポンサー広告"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 250 }}
        data-ad-client={ids.client}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
};
