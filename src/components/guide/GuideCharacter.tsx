import type { ReactNode } from "react";
import { InViewOnce } from "@/components/motion/InViewOnce";

/**
 * 初代 案内役「しるべ」。
 *
 * 紺の羽織に金の羅盤を持つ若い易者のイラスト（2026-10-17 作成、
 * 出どころは docs/guide-character.md）。頁の主役ではなく、入口・行き止まり・
 * 待ち時間に一言添える役なので、次を守る。
 *
 * - **頁の主役の画像より先に読ませない。**既定は loading="lazy"。
 *   最初の画面に出る所（トップの「エージェントに案内してもらう」）だけ priority="low" で
 *   eager にし、fetchPriority="low" で他を待たせない。
 * - **場所を先に取る。**width/height を必ず付け、読み込みで本文が動かない。
 * - **軽く。**AVIF と WebP を 96/240/480 の 3 幅で持ち、sizes で
 *   表示幅に合う 1 枚だけを取らせる（public/guide/）。
 * - **言葉は参考の案内。**吉凶を断定する台詞は持たせない。
 */

export type GuidePose = "pointing" | "magnifier" | "compass" | "thumbsup";
export type GuideSize = "sm" | "md" | "lg";

export const GUIDE_NAME = "しるべ";
export const GUIDE_TITLE = "初代 案内役";

/** 240px 版の実寸（縦横比のために width/height へ入れる）。 */
const POSES: Record<GuidePose, { w: number; h: number; label: string }> = {
  pointing: { w: 240, h: 296, label: "指をさして案内するポーズ" },
  magnifier: { w: 240, h: 321, label: "虫めがねを手に考えるポーズ" },
  compass: { w: 240, h: 308, label: "羅盤と暦を持つポーズ" },
  thumbsup: { w: 240, h: 279, label: "スマートフォンを手に親指を立てるポーズ" },
};

/** 表示幅（CSS px）。左がスマホ、右が sm 以上。 */
const SIZES: Record<GuideSize, { cls: string; sizes: string }> = {
  sm: { cls: "w-16 sm:w-24", sizes: "(min-width: 640px) 96px, 64px" },
  md: { cls: "w-20 sm:w-36", sizes: "(min-width: 640px) 144px, 80px" },
  lg: { cls: "w-24 sm:w-48", sizes: "(min-width: 640px) 192px, 96px" },
};

const WIDTHS = [96, 240, 480] as const;

export function guideSrcSet(pose: GuidePose, ext: "avif" | "webp") {
  return WIDTHS.map((w) => `/guide/shirube-${pose}-${w}.${ext} ${w}w`).join(
    ", ",
  );
}

export function GuideAvatar({
  pose,
  size = "md",
  priority = "lazy",
  decorative = false,
  float = false,
  className = "",
}: {
  pose: GuidePose;
  size?: GuideSize;
  /** lazy: 既定。low: 最初の画面に出る所だけ（eager + fetchPriority low）。 */
  priority?: "lazy" | "low";
  /** 台詞や状態の文を別に読み上げるときは装飾扱いにする。 */
  decorative?: boolean;
  /** 静かに上下に浮かせる（motion-float。動きを減らす設定では止まる）。 */
  float?: boolean;
  className?: string;
}) {
  const p = POSES[pose];
  const s = SIZES[size];
  return (
    <picture
      className={`block shrink-0 ${s.cls} ${float ? "motion-float" : ""} ${className}`}
    >
      <source
        type="image/avif"
        srcSet={guideSrcSet(pose, "avif")}
        sizes={s.sizes}
      />
      <source
        type="image/webp"
        srcSet={guideSrcSet(pose, "webp")}
        sizes={s.sizes}
      />
      <img
        src={`/guide/shirube-${pose}-240.webp`}
        alt={decorative ? "" : `${GUIDE_TITLE}の${GUIDE_NAME}（${p.label}）`}
        aria-hidden={decorative || undefined}
        width={p.w}
        height={p.h}
        loading={priority === "low" ? "eager" : "lazy"}
        fetchPriority={priority === "low" ? "low" : "auto"}
        decoding="async"
        className="block h-auto w-full select-none"
        draggable={false}
      />
    </picture>
  );
}

/**
 * イラスト + 吹き出し。スマホでは小さな顔見せ、sm 以上で大きく。
 * side は吹き出しに対してイラストを置く側。
 */
export default function GuideCharacter({
  pose,
  size = "md",
  priority = "lazy",
  side = "left",
  showName = true,
  float = false,
  children,
  className = "",
}: {
  pose: GuidePose;
  size?: GuideSize;
  priority?: "lazy" | "low";
  side?: "left" | "right";
  showName?: boolean;
  float?: boolean;
  /** 台詞。 */
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={`m-0 flex items-end gap-3 sm:gap-4 ${
        side === "right" ? "flex-row-reverse" : ""
      } ${className}`}
      data-guide-pose={pose}
    >
      <GuideAvatar pose={pose} size={size} priority={priority} float={float} />
      <figcaption
        className={`relative mb-3 min-w-0 flex-1 rounded-2xl border border-[#c9a54a]/60 bg-white px-4 py-3 text-left text-sm leading-relaxed text-slate-800 shadow-sm`}
      >
        {/* 吹き出しの尾。イラストの側へ向ける。 */}
        <span
          aria-hidden="true"
          className={`absolute bottom-4 h-3 w-3 rotate-45 border-[#c9a54a]/60 bg-white ${
            side === "right"
              ? "-right-[7px] border-r border-t"
              : "-left-[7px] border-b border-l"
          }`}
        />
        {showName && (
          <span className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-wider text-[#1e2a5a]">
            {/* 名札に一度だけ金の光が走る（motion-sweep） */}
            <InViewOnce className="motion-sweep rounded-sm bg-[#1e2a5a] px-1.5 py-0.5 text-[10px] text-[#f3d98b]">
              {GUIDE_TITLE}
            </InViewOnce>
            {GUIDE_NAME}
          </span>
        )}
        <span className="block">{children}</span>
      </figcaption>
    </figure>
  );
}
