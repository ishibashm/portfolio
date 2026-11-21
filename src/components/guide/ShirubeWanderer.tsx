"use client";

/**
 * 画面最下端をゆっくり歩き回る案内役「しるべ」（試作コンポーネント）。
 *
 * - 公式イラスト（`GuideAvatar` の `pose="pointing"`）のみを使う。
 *   `float`（motion-float）は歩き回りと競合するため付けない。
 * - ラッパーは `pointer-events: none` で固定配置し、本文や CTA を塞がない。
 * - `prefers-reduced-motion: reduce`（および SSR / JS 実行前）では動かさず、
 *   画面下端の端に静かに立つ（docs/motion-accents.md の方針）。
 * - 本番サイトへの組み込み手順は`docs/guide-shirube-wander.md` を参照。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GuideAvatar, GUIDE_NAME } from "@/components/guide/GuideCharacter";
import { prefersReducedMotion } from "@/components/motion/reducedMotion";
import {
  clampX,
  createInitialWanderState,
  getWanderBounds,
  getWanderConfig,
  stepWanderState,
  type WanderFacing,
  type WanderPhase,
  type WanderState,
} from "@/components/guide/shirubeWanderLogic";
import "./ShirubeWanderer.css";

export type ShirubeWanderVisualState = WanderPhase | "idle";

export interface ShirubeWanderSnapshot {
  motion: "active" | "reduced";
  state: ShirubeWanderVisualState;
  facing: WanderFacing;
}

export interface ShirubeWandererProps {
  /**
   * 動きの抑制を上書きする（デモページのトグル確認用）。
   * 省略時（本番の既定）は OS の prefers-reduced-motion を尊重する。
   */
  forceReducedMotion?: boolean;
  /** reduced-motion 時に静止しておく側。既定は右下端。 */
  restSide?: "right" | "left";
  /** 左右端からの余白（px）。 */
  edgeMarginPx?: number;
  /**
   * 任意: しるべ本人を押したときのハンドラ。
   * 指定しない既定ではしるべ自体も pointer-events: none になり、
   * 下にあるボタン・リンクのタップを一切妨げない。
   */
  onInteract?: () => void;
  /** デモ確認用: 状態変化の通知（高頻度な座標更新では呼ばない）。 */
  onStatusChange?: (snapshot: ShirubeWanderSnapshot) => void;
}

const DEFAULT_ACTOR_WIDTH_DESKTOP = 80;
const DEFAULT_ACTOR_WIDTH_MOBILE = 56;

function subscribeReducedMotion(onStoreChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onStoreChange);
    return () => mq.removeEventListener("change", onStoreChange);
  }
  return () => {};
}

/**
 * OS の prefers-reduced-motion を購読する。
 * SSR / hydration 前の既定は true（静止＝最終の絵）に倒す。
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
}

export function ShirubeWanderer({
  forceReducedMotion,
  restSide = "right",
  edgeMarginPx = 16,
  onInteract,
  onStatusChange,
}: ShirubeWandererProps) {
  const actorRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<WanderState | null>(null);
  const lastReportedRef = useRef<string>("");
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const osReduced = usePrefersReducedMotion();
  const isReduced = forceReducedMotion ?? osReduced;
  const restFacing: WanderFacing = restSide === "left" ? "right" : "left";

  const [activeVisual, setActiveVisual] = useState<{
    state: WanderPhase;
    facing: WanderFacing;
  }>({
    state: "walking",
    facing: restFacing,
  });

  useEffect(() => {
    const actor = actorRef.current;

    const reportStatus = (
      motion: "active" | "reduced",
      nextState: ShirubeWanderVisualState,
      nextFacing: WanderFacing,
    ) => {
      const key = `${motion}:${nextState}:${nextFacing}`;
      if (lastReportedRef.current === key) return;
      lastReportedRef.current = key;
      onStatusChangeRef.current?.({
        motion,
        state: nextState,
        facing: nextFacing,
      });
    };

    if (isReduced) {
      stateRef.current = null;
      if (actor) {
        actor.style.transform = "";
      }
      reportStatus("reduced", "idle", restFacing);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const measureActorWidth = () => {
      const measured = actorRef.current?.getBoundingClientRect().width ?? 0;
      if (measured > 0) return measured;
      return window.innerWidth < 640
        ? DEFAULT_ACTOR_WIDTH_MOBILE
        : DEFAULT_ACTOR_WIDTH_DESKTOP;
    };

    const getBoundsAndConfig = () => {
      const vw = window.innerWidth;
      const aw = measureActorWidth();
      return {
        bounds: getWanderBounds(vw, aw, edgeMarginPx),
        config: getWanderConfig(vw),
      };
    };

    const initial = getBoundsAndConfig();
    const initialState = createInitialWanderState(
      initial.bounds,
      initial.config,
    );
    stateRef.current = initialState;

    if (actor) {
      actor.style.transform = `translate3d(${initialState.x.toFixed(2)}px, 0, 0)`;
    }
    reportStatus("active", initialState.phase, initialState.facing);

    let rafId = 0;
    let lastTs = performance.now();
    let syncedPhase: WanderPhase | null = null;
    let syncedFacing: WanderFacing | null = null;

    const tick = (now: number) => {
      const elapsed = now - lastTs;
      lastTs = now;

      if (document.visibilityState === "hidden") {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const current = stateRef.current;
      if (!current) return;

      const { bounds, config } = getBoundsAndConfig();
      const next = stepWanderState(current, elapsed, bounds, config);
      stateRef.current = next;

      if (actorRef.current) {
        actorRef.current.style.transform = `translate3d(${next.x.toFixed(2)}px, 0, 0)`;
      }

      if (next.phase !== syncedPhase || next.facing !== syncedFacing) {
        syncedPhase = next.phase;
        syncedFacing = next.facing;
        setActiveVisual({ state: next.phase, facing: next.facing });
      }
      reportStatus("active", next.phase, next.facing);

      rafId = window.requestAnimationFrame(tick);
    };

    const handleResize = () => {
      const current = stateRef.current;
      if (!current) return;
      const { bounds } = getBoundsAndConfig();
      const clampedX = clampX(current.x, bounds);
      const clampedTarget = clampX(current.targetX, bounds);
      stateRef.current = { ...current, x: clampedX, targetX: clampedTarget };
      if (actorRef.current) {
        actorRef.current.style.transform = `translate3d(${clampedX.toFixed(2)}px, 0, 0)`;
      }
    };

    window.addEventListener("resize", handleResize);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(rafId);
    };
  }, [isReduced, restFacing, edgeMarginPx]);

  const visualState: ShirubeWanderVisualState = isReduced
    ? "idle"
    : activeVisual.state;
  const facing: WanderFacing = isReduced ? restFacing : activeVisual.facing;

  // pointing ポーズは元絵が左向きなので、右向きに歩くときだけ左右反転する
  const flipTransform = facing === "right" ? "scaleX(-1)" : "scaleX(1)";

  const avatar = (
    <span className="shirube-wander-gait">
      <span className="shirube-wander-shadow" aria-hidden="true" />
      <GuideAvatar
        pose="pointing"
        size="sm"
        priority="lazy"
        decorative={!onInteract}
        float={false}
        className="max-w-14 sm:max-w-20"
      />
    </span>
  );

  return (
    <div
      className="shirube-wander-stage"
      data-testid="shirube-wanderer"
      data-motion={isReduced ? "reduced" : "active"}
      data-state={visualState}
      data-facing={facing}
      data-rest-side={restSide}
      aria-hidden={onInteract ? undefined : true}
    >
      <div
        ref={actorRef}
        className="shirube-wander-actor"
        data-testid="shirube-wanderer-actor"
      >
        <div
          className="shirube-wander-flip"
          data-testid="shirube-wanderer-flip"
          style={{ transform: flipTransform }}
        >
          {onInteract ? (
            <button
              type="button"
              className="shirube-wander-hit"
              aria-label={`案内役の${GUIDE_NAME}に話しかける`}
              onClick={onInteract}
            >
              {avatar}
            </button>
          ) : (
            avatar
          )}
        </div>
      </div>
    </div>
  );
}

export default ShirubeWanderer;
