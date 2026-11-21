/**
 * 4 コマのすり足で歩く小さなちびしるべ（スプライト）。
 *
 * 画面下を歩き回る ShirubeWanderer の `gait="shuffle"` と、カード・バナー・
 * 読み込み中の表示などに置く単体の小物（`<ShirubeShuffle />`）の両方で使う。
 *
 * - 素材は public/guide/walk/shirube-shuffle-{128,240}.webp（4 コマ横並び）。
 * - コマ送りは transform の steps(4) だけ（background-position は使わない）。
 * - prefers-reduced-motion: reduce では 1 コマ目で止まり、移動もしない。
 * - 飾りなので既定は aria-hidden。意味を持たせたいときは label を渡す。
 * - スタイルは ShirubeWanderer.css にまとめてある（import 済み）。
 */

import type { CSSProperties } from "react";
import "./ShirubeWanderer.css";

/** 1 コマの縦横比（幅 / 高さ）。284 × 546 の原寸から。 */
export const SHIRUBE_SHUFFLE_ASPECT = 284 / 546;

export const SHIRUBE_SHUFFLE_SRC_SET = [
  "/guide/walk/shirube-shuffle-128.webp 268w",
  "/guide/walk/shirube-shuffle-240.webp 500w",
].join(", ");

/**
 * スプライト本体（窓 + 4 コマの帯）。高さは CSS 変数 --shuffle-h で決まる。
 * displayHeight は画像の選び分け（sizes）にだけ使う目安の表示高さ（px）。
 */
export function ShirubeShuffleSprite({
  displayHeight = 120,
}: {
  displayHeight?: number;
}) {
  // 帯の表示幅 = 高さ × 1 コマの縦横比 × 4 コマ
  const stripWidth = Math.ceil(displayHeight * SHIRUBE_SHUFFLE_ASPECT * 4);
  return (
    <span
      className="shirube-shuffle-window"
      data-testid="shirube-shuffle-sprite"
    >
      {/* 4 コマの帯を transform でずらすため、next/image の最適化は使わない */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="shirube-shuffle-strip"
        src="/guide/walk/shirube-shuffle-240.webp"
        srcSet={SHIRUBE_SHUFFLE_SRC_SET}
        sizes={`${stripWidth}px`}
        width={500}
        height={240}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

export interface ShirubeShuffleProps {
  /** 表示の高さ（px）。既定 48。 */
  size?: number;
  /**
   * true なら置いた箱の横幅いっぱいを行ったり来たりする（バナーや読み込み中の帯向け）。
   * false（既定）はその場で足踏みする。
   */
  travel?: boolean;
  /** 1 往復の秒数（travel のとき）。既定 14。 */
  travelSeconds?: number;
  /** 読み上げ用の説明。省略時は飾り扱い（aria-hidden）。 */
  label?: string;
  className?: string;
}

export function ShirubeShuffle({
  size = 48,
  travel = false,
  travelSeconds = 14,
  label,
  className,
}: ShirubeShuffleProps) {
  const style = {
    "--shuffle-h": `${size}px`,
    "--shuffle-travel": `${travelSeconds}s`,
  } as CSSProperties;
  return (
    <span
      className={["shirube-shuffle", className].filter(Boolean).join(" ")}
      data-testid="shirube-shuffle"
      data-travel={travel ? "true" : "false"}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="shirube-shuffle-mover">
        <ShirubeShuffleSprite displayHeight={size} />
      </span>
    </span>
  );
}

export default ShirubeShuffle;
