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
 * 広告枠。
 *
 * 以前は AdSense が未設定のとき「[ 広告スペース ]」という破線の空箱を描いており、
 * 公開中の全ページ（トップ・記事465ページ・使い方）に出ていた。審査担当者からは
 * 「作りかけのサイト」に見えるうえ、利用者にとっても意味がない。何も描かない。
 *
 * スロットIDが無いときも描かない。data-ad-slot="0000000000" のような
 * 見本値を入れると AdSense 側でエラーになる。スロット無しで運用したい場合は
 * 管理画面で「自動広告」を有効にする（このコンポーネントは使わない）。
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

  useEffect(() => {
    if (!ids || !resolvedSlot || pushed.current) return;
    pushed.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (err) {
      console.warn("AdSense push error:", err);
    }
  }, [ids, resolvedSlot]);

  if (!ids || !resolvedSlot) return null;

  return (
    <div
      className={`w-full overflow-hidden my-4 ${className}`}
      aria-label="スポンサー広告"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ids.client}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
};
