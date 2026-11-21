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

export const SHIRUBE_HIDDEN_STORAGE_KEY = "shirube:hidden";

export interface ShirubeBubbleProps {
  tip: ShirubeTip;
  /** アクティブ時のキャラ位置（ビューポート座標）。reduced-motion 時は null */
  anchor: {
    x: number;
    y: number;
    actorWidth: number;
    actorHeight: number;
    viewportWidth: number;
    /** 本文が始まる x（固定サイドバーの右端）。吹き出しをその左へ出さない */
    minLeft?: number;
    viewportHeight: number;
  } | null;
  restSide: "right" | "left";
  onHideShirube: () => void;
  onDismissBubble: () => void;
}

export function ShirubeBubble({
  tip,
  anchor,
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
  let placement: "above" | "below" = "above";

  if (anchor) {
    const isMobile = anchor.viewportWidth < 640;
    const bubbleWidth = isMobile ? 180 : 220;
    const margin = 8;
    const minLeft = (anchor.minLeft ?? 0) + margin;
    const centerX = anchor.x + anchor.actorWidth * 0.5;
    const rawLeft = centerX - bubbleWidth * 0.5;
    const clampedLeft = Math.min(
      Math.max(minLeft, anchor.viewportWidth - bubbleWidth - margin),
      Math.max(minLeft, rawLeft),
    );

    const actorTop = anchor.y - anchor.actorHeight;
    // 上に十分な空間（約 110px）が無ければキャラの下側へ出す
    if (actorTop < 118 && anchor.y + 96 < anchor.viewportHeight) {
      placement = "below";
      style = {
        left: `${Math.round(clampedLeft)}px`,
        top: `${Math.round(anchor.y + 8)}px`,
      };
    } else {
      placement = "above";
      const bottomOffset = Math.max(
        margin,
        anchor.viewportHeight - actorTop + 10,
      );
      style = {
        left: `${Math.round(clampedLeft)}px`,
        bottom: `${Math.round(bottomOffset)}px`,
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
