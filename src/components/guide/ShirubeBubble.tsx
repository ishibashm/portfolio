"use client";

/**
 * 案内役「しるべ」の吹き出し UI と、非表示時の端タブ。
 *
 * - 配色は紺（#1e2a5a）・金（#c9a54a）・生成り（#faf7f3 / #f8f1dc）・白のみ。
 *   緑や赤は吉凶判定専用のため、吹き出し UI には一切使わない。
 * - `role="status"` / `aria-live="polite"` でやさしく読み上げる。
 * - 画面外へはみ出さないよう、表示座標をビューポート内に収める。
 */

import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  ShirubeTip,
  ShirubeTipLink,
} from "@/components/guide/shirubeTips";
import {
  bubbleSize,
  chooseBubblePlacement,
  type BubbleAnchor,
  type BubbleRect,
} from "@/components/guide/shirubeBubblePlace";

export const SHIRUBE_HIDDEN_STORAGE_KEY = "shirube:hidden";

export interface ShirubeBubbleProps {
  tip: ShirubeTip;
  /** キャラ位置（ビューポート座標）と、重ねたくない物の矩形。null なら CSS の既定位置 */
  anchor: (BubbleAnchor & { blockers?: readonly BubbleRect[] }) | null;
  /** 動きを減らす設定（位置は anchor から計算するが、data-anchored は reduced） */
  reduced?: boolean;
  restSide: "right" | "left";
  onHideShirube: () => void;
  onDismissBubble: () => void;
}

export function ShirubeBubble({
  tip,
  anchor,
  reduced = false,
  restSide,
  onHideShirube,
  onDismissBubble,
}: ShirubeBubbleProps) {
  const links: readonly ShirubeTipLink[] = tip.links?.length
    ? tip.links
    : tip.link
      ? [tip.link]
      : [];

  let style: CSSProperties | undefined;
  let placement: "above" | "below" | "left" | "right" = "above";

  if (anchor) {
    const size = bubbleSize(anchor.viewportWidth, tip.text, links.length);
    const pl = chooseBubblePlacement(anchor, size, anchor.blockers ?? []);
    placement = pl.placement;
    if (pl.placement === "above") {
      // 下端を合わせて、実際の高さが見積もりと違っても上へ伸びるようにする
      style = {
        left: `${Math.round(pl.left)}px`,
        bottom: `${Math.round(anchor.viewportHeight - (pl.top + size.height))}px`,
      };
    } else if (pl.placement === "left") {
      style = {
        right: `${Math.round(anchor.viewportWidth - (pl.left + size.width))}px`,
        top: `${Math.round(pl.top)}px`,
      };
    } else {
      style = {
        left: `${Math.round(pl.left)}px`,
        top: `${Math.round(pl.top)}px`,
      };
    }
  }

  return (
    <div
      className="shirube-bubble"
      data-testid="shirube-bubble"
      data-tip-id={tip.id}
      data-placement={placement}
      data-rest-side={restSide}
      data-anchored={anchor ? "dynamic" : "reduced"}
      data-reduced={reduced || undefined}
      role="status"
      aria-live="polite"
      style={style}
    >
      <div className="shirube-bubble-head">
        <span className="shirube-bubble-name">しるべ</span>
        <button
          type="button"
          className="shirube-bubble-hide"
          aria-label="しるべを休ませる"
          title="休む"
          onClick={onHideShirube}
        >
          ×
        </button>
      </div>
      <p className="shirube-bubble-text">{tip.text}</p>
      {links.length > 0 ? (
        <div className="shirube-bubble-links">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shirube-bubble-link"
              onClick={onDismissBubble}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ShirubeHiddenTab({ onRestore }: { onRestore: () => void }) {
  return (
    <div
      className="shirube-wander-stage"
      data-testid="shirube-wanderer"
      data-hidden="true"
    >
      <button
        type="button"
        className="shirube-restore-tab"
        data-testid="shirube-restore-tab"
        aria-label="しるべを呼ぶ"
        title="しるべを呼ぶ"
        onClick={onRestore}
      >
        し
      </button>
    </div>
  );
}
