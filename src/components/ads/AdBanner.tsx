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
 * 枠の高さを先に確保する（CLS 対策）。
 *
 * 以前は高さ 0 の器に <ins> を置いていたため、広告が届いた瞬間に
 * 下の本文が 250〜280px ずつ押し下げられていた。読んでいる途中で
 * 行が飛ぶのは CLS として計測されるうえ、誤タップも招く（広告の
 * 近くに押しやすいものを置かない、という AdSense のポリシーにも触れる）。
 *
 * 値はレスポンシブ広告が実際に返す高さの代表値。広告が届かなかったときに
 * 空いて見える高さでもあるので、必要以上に大きくしない。
 */
export const AD_MIN_HEIGHT: Record<
  NonNullable<AdBannerProps["format"]>,
  number
> = {
  auto: 280,
  rectangle: 250,
  horizontal: 100,
  fluid: 120,
};

/** 画面に入る少し手前で読み込む距離。 */
export const AD_LAZY_ROOT_MARGIN = "400px 0px";

/**
 * 手動広告枠。
 *
 * ID かスロットが無いときは何も描かない。空の破線枠は審査でも利用者でも
 * 「作りかけ」に見えるため出さない。data-ad-slot="0000000000" のような
 * 見本値を入れると AdSense 側でエラーになる。スロット無しで運用したい場合は
 * 管理画面で「自動広告」を有効にする（このコンポーネントは使わない）。
 *
 * 読み込みは画面に近づいてから（`AD_LAZY_ROOT_MARGIN`）。記事の末尾の枠を
 * 開いた直後に読むと、本文の描画と回線を取り合う。IntersectionObserver の
 * 無い環境では従来どおりすぐ読む。
 *
 * 「広告」の表記を枠の上に置く。本文やナビと見分けが付かない配置は
 * AdSense のポリシー（誤解を招く配置）に当たる。
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
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ids || !resolvedSlot || pushed.current) return;
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
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      push();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          push();
        }
      },
      { rootMargin: AD_LAZY_ROOT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ids, resolvedSlot]);

  if (!ids || !resolvedSlot) return null;

  return (
    <div
      ref={boxRef}
      className={`w-full overflow-hidden my-6 ${className}`}
      aria-label="スポンサー広告"
    >
      <p className="mb-1 text-xs leading-4 text-slate-500">広告</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: AD_MIN_HEIGHT[format] }}
        data-ad-client={ids.client}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
};
