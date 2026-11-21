"use client";

/**
 * 画面最下端をゆっくり歩き回る案内役「しるべ」（試作コンポーネント）。
 *
 * - 見た目は部品分けしたちびしるべ（`ShirubeWalkRig`）。歩くあいだは足を交互に
 *   振り、体を小さく上下させる。止まっているときは足をそろえて静かに呼吸する。
 * - 画面下に固定されたボタン帯（固定 CTA・下部ナビ・`data-shirube-avoid`）が
 *   あれば、その上端より上を歩く（スマホで主要ボタンに重ならないように）。
 * - ラッパーは `pointer-events: none` で固定配置し、本文や CTA を塞がない。
 * - `prefers-reduced-motion: reduce`（および SSR / JS 実行前）では動かさず、
 *   画面下端の端に静かに立つ（docs/motion-accents.md の方針）。
 * - 本番サイトへの組み込み手順は`docs/guide-shirube-wander.md` を参照。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GUIDE_NAME } from "@/components/guide/GuideCharacter";
import { ShirubeWalkRig } from "@/components/guide/ShirubeWalkRig";
import { prefersReducedMotion } from "@/components/motion/reducedMotion";
import {
  clampX,
  computeBottomLift,
  createInitialWanderState,
  getWanderBounds,
  getWanderConfig,
  stepWanderState,
  type BottomObstacleRect,
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
  /**
   * 画面下に固定されたボタン帯を自動で避ける（既定 true）。
   * `[data-shirube-avoid]` を付けた要素と、画面下端にある position: fixed / sticky の
   * 操作要素を見つけたら、その上端より上を歩く。
   */
  avoidBottomObstacles?: boolean;
  /** デモ確認用: 状態変化の通知（高頻度な座標更新では呼ばない）。 */
  onStatusChange?: (snapshot: ShirubeWanderSnapshot) => void;
}

// 表示の高さ 120px / 60px × 素材の縦横比
const DEFAULT_ACTOR_WIDTH_DESKTOP = 59;
const DEFAULT_ACTOR_WIDTH_MOBILE = 30;

const AVOID_SELECTOR = "[data-shirube-avoid]";
const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, [role='button']";

/**
 * 画面下端の固定ボタン帯を集める。DOM を読むだけで、何も書き換えない。
 * elementsFromPoint は pointer-events: none の要素（しるべの舞台自身など）を返さない。
 */
export function collectBottomObstacles(
  doc: Document = document,
  win: Window = window,
): BottomObstacleRect[] {
  const vh = win.innerHeight;
  const vw = win.innerWidth;
  const found = new Set<Element>();
  doc.querySelectorAll(AVOID_SELECTOR).forEach((el) => found.add(el));

  if (typeof doc.elementsFromPoint === "function") {
    const ys = [vh - 4, vh - 18];
    const xs = [
      0.03, 0.12, 0.22, 0.32, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88, 0.97,
    ].map((r) => Math.round(vw * r));
    for (const y of ys) {
      for (const x of xs) {
        for (const hit of doc.elementsFromPoint(x, y)) {
          // 操作できる要素を含む固定・粘着の帯だけを対象にする
          let el: Element | null = hit;
          for (let depth = 0; el && depth < 6; depth += 1) {
            if (el === doc.body || el === doc.documentElement) break;
            const pos = win.getComputedStyle(el).position;
            if (pos === "fixed" || pos === "sticky") {
              if (
                el.matches(INTERACTIVE_SELECTOR) ||
                el.querySelector(INTERACTIVE_SELECTOR)
              ) {
                found.add(el);
              }
              break;
            }
            el = el.parentElement;
          }
        }
      }
    }
  }

  const rects: BottomObstacleRect[] = [];
  found.forEach((el) => {
    if (el.closest(".shirube-wander-stage")) return;
    const r = el.getBoundingClientRect();
    rects.push({
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
  });
  return rects;
}

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
  avoidBottomObstacles = true,
  onInteract,
  onStatusChange,
}: ShirubeWandererProps) {
  const actorRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<WanderState | null>(null);
  const lastReportedRef = useRef<string>("");
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const osReduced = usePrefersReducedMotion();
  const isReduced = forceReducedMotion ?? osReduced;
  const restFacing: WanderFacing = restSide === "left" ? "right" : "left";

  // 画面下の固定ボタン帯を避ける持ち上げ量（CSS 変数 --shirube-lift）
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !avoidBottomObstacles || typeof window === "undefined") {
      stage?.style.removeProperty("--shirube-lift");
      return;
    }
    let raf = 0;
    let last = -1;
    const measure = () => {
      raf = 0;
      const lift = computeBottomLift(
        collectBottomObstacles(document, window),
        window.innerHeight,
      );
      if (lift !== last) {
        last = lift;
        stage.style.setProperty("--shirube-lift", `${lift}px`);
        stage.setAttribute("data-lifted", lift > 0 ? "true" : "false");
      }
    };
    const schedule = () => {
      if (raf || typeof window.requestAnimationFrame !== "function") return;
      raf = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    // 後から出る固定 CTA（スクロールで現れる帯など）にも追従する
    const interval = window.setInterval(schedule, 2000);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.clearInterval(interval);
      if (raf && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [avoidBottomObstacles]);

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

  // 歩く素材は元絵が右向きなので、左へ歩くときだけ左右反転する
  const flipTransform = facing === "left" ? "scaleX(-1)" : "scaleX(1)";

  const avatar = (
    <span className="shirube-wander-gait">
      <span className="shirube-wander-shadow" aria-hidden="true" />
      <ShirubeWalkRig />
    </span>
  );

  return (
    <div
      ref={stageRef}
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
