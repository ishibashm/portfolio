"use client";

/**
 * 画面全体を自由に歩き回り、状況に合わせて自動で案内する「しるべ」。
 *
 * - ドラッグで一時的に移動でき、しばらくすると定位置へ戻る。
 * - 画面最下端と、本文中の見出し・カード・ボタンなどの上端（床 / perch）を
 *   歩いたり放物線ジャンプで飛び移ったりしながら巡回する。
 * - ページ内容・スクロール・結果表示・待機・空状態に応じて短い案内吹き出しを
 *   自動表示し、対象が画面内にあれば近くへ移動して指さし＋金の縁取りを行う。
 * - キャラをタップすると、ページへのリンクやひとこと案内を選べる。
 *   吹き出しの × で右下の小さなタブへ隠れ、localStorage（shirube:hidden）に保存する。
 * - `prefers-reduced-motion: reduce` では移動・ジャンプを行わず右下に静止し、
 *   吹き出しと対象の縁取りだけで案内する。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname } from "next/navigation";
import { ShirubeWalkRig } from "@/components/guide/ShirubeWalkRig";
import { ShirubeShuffleSprite } from "@/components/guide/ShirubeShuffle";
import {
  SHIRUBE_HIDDEN_STORAGE_KEY,
  ShirubeBubble,
  ShirubeHiddenTab,
} from "@/components/guide/ShirubeBubble";
import { prefersReducedMotion } from "@/components/motion/reducedMotion";
import {
  collectAvoidRects,
  collectPerchCandidates,
  findPerches,
  type Perch,
} from "@/components/guide/shirubePerch";
import {
  canShowAutoTip,
  chooseTipForTap,
  chooseTipForTrigger,
  createTipRateLimitState,
  DEFAULT_TIP_RATE_LIMIT,
  findEmptyRequiredInput,
  FORM_NEXT_INPUT_TIP,
  GENERIC_EMPTY_TIP,
  GENERIC_RESULT_TIP,
  getTipsForRoute,
  isElementInViewport,
  recordAutoTipShown,
  resolveTipTarget,
  type ShirubeTip,
  type ShirubeTipTrigger,
  type TipRateLimitState,
} from "@/components/guide/shirubeTips";
import {
  computeBottomLift,
  createInitialWanderState,
  createSeededRandom,
  getHomeRightMarginPx,
  getWanderBounds,
  getWanderConfig,
  reconcilePerch,
  nextAwayDelay,
  returnShirubeHome,
  startPointingToward,
  stepWanderState,
  startStepping,
  type BottomObstacleRect,
  type RoamContext,
  type WanderFacing,
  type WanderGait,
  type WanderPhase,
  type WanderState,
} from "@/components/guide/shirubeWanderLogic";
import {
  bubbleSize,
  chooseBubblePlacement,
  collectBubbleBlockers,
  type BubbleAnchor,
  type BubbleRect,
} from "@/components/guide/shirubeBubblePlace";
import { ShirubeMenu } from "./ShirubeMenu";
import {
  exceedsDragThreshold,
  getDefaultActorSize,
  placeDroppedShirube,
  type ShirubePosition,
} from "./shirubeDrag";
import "./ShirubeWanderer.css";

type BubbleAnchorState = BubbleAnchor & { blockers: BubbleRect[] };

export type ShirubeWanderVisualState = WanderPhase | "idle";

export interface ShirubeWanderSnapshot {
  motion: "active" | "reduced";
  state: ShirubeWanderVisualState;
  facing: WanderFacing;
  perchId?: string;
  tipId?: string | null;
  hidden?: boolean;
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
   * 任意: しるべ本人を押したときのハンドラを上書きする。
   * 省略時はしるべのメニューを開く。
   */
  onInteract?: () => void;
  /**
   * 画面下に固定されたボタン帯を自動で避ける（既定 true）。
   * `[data-shirube-avoid]` と画面下端の固定操作要素を避けて最下端床を持ち上げる。
   */
  avoidBottomObstacles?: boolean;
  /**
   * 歩き方。"rig"（既定）は部品分けで足を振る歩き、"shuffle" は 4 コマのすり足。
   */
  gait?: WanderGait;
  /** 立ち止まったときにときどき正面を向いて手を振るか（既定: rig のとき true）。 */
  greet?: boolean;
  /** デモ・テスト用: ランダムの種を固定する（省略時は Math.random）。 */
  seed?: number;
  /** デモ・テスト用: pathname を明示上書きする。 */
  pathnameOverride?: string;
  /** 自動案内の最小間隔（ms）。既定 45000。 */
  autoTipMinIntervalMs?: number;
  /** 入室後の初回案内までの待機時間（ms）。既定は 6000〜10000ms のランダム。 */
  enterTipDelayMs?: number;
  /** 無操作案内の待機時間（ms）。既定 45000。 */
  idleTipDelayMs?: number;
  /** デモ確認用: 状態変化の通知（高頻度な座標更新では呼ばない）。 */
  onStatusChange?: (snapshot: ShirubeWanderSnapshot) => void;
}

const AVOID_SELECTOR = "[data-shirube-avoid]";
const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, [role='button']";
const FORM_INPUT_SELECTOR = "input, textarea, select, [contenteditable='true']";

const BUBBLE_AUTO_HIDE_MS = 7000;
const TARGET_HIGHLIGHT_MS = 2500;
const TARGET_HIGHLIGHT_CLASS = "shirube-tip-target-highlight";

const FRONT_FACING_PHASES = new Set<WanderPhase>([
  "greeting",
  "sitting",
  "pointing",
]);
const SIDE_FACING_PHASES = new Set<WanderPhase>([
  "paused",
  "turning",
  "walking",
  "stepping",
]);

/* --------------------------------------------------------------------------
 * 画面下端の固定ボタン帯の収集（既存 API 互換）
 * ------------------------------------------------------------------------ */

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

/* --------------------------------------------------------------------------
 * prefers-reduced-motion 購読（既存 API 互換）
 * ------------------------------------------------------------------------ */

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
 * 本文（main）が始まる x。PC で左に固定のサイドバーがあるとき、その上には立たない。
 * 本文が狭すぎる・main が無いときは 0（画面の左端から使う）。
 */
export function getContentLeft(
  doc: Document = document,
  win: Window = window,
): number {
  const main = doc.querySelector("main");
  if (!main) return 0;
  const left = main.getBoundingClientRect().left;
  if (!Number.isFinite(left) || left <= 0) return 0;
  return left > win.innerWidth - 240 ? 0 : Math.round(left);
}

/** 縦スクロールバーを除いた画面の幅（定位置を右端にぴったり寄せるため） */
function getLayoutWidth(win: Window = window): number {
  const cw = win.document?.documentElement?.clientWidth ?? 0;
  return cw > 0 && cw <= win.innerWidth ? cw : win.innerWidth;
}

/**
 * 定位置（右端）とのすき間。PC 4px / スマホ 2px に、ノッチなどの
 * safe-area-inset-right（ステージの padding-right に入れてある）を足す。
 */
function getRightMarginPx(stage: HTMLElement | null, vw: number): number {
  let safe = 0;
  if (stage && typeof window !== "undefined") {
    safe = parseFloat(window.getComputedStyle(stage).paddingRight) || 0;
  }
  return getHomeRightMarginPx(vw) + safe;
}

function withContentLeft<T extends { minX: number; maxX: number }>(
  bounds: T,
  contentLeft: number,
  edgeMarginPx: number,
): T {
  const minX = Math.min(
    bounds.maxX,
    Math.max(bounds.minX, contentLeft + edgeMarginPx),
  );
  return { ...bounds, minX };
}

/**
 * ページにもともと描かれている大きなしるべ（トップの指さしなど）が見えているか。
 * 見えている間は歩き回るしるべは姿を消し、同じ画面に 2 人並ばないようにする。
 */
export function isOtherShirubeVisible(
  doc: Document = document,
  win: Window = window,
): boolean {
  const imgs = doc.querySelectorAll<HTMLImageElement>(
    'img[src*="/guide/shirube-"]',
  );
  for (const img of imgs) {
    if (img.closest(".shirube-wander-stage")) continue;
    const r = img.getBoundingClientRect();
    if (r.height < 64 || r.width <= 0) continue;
    const visibleH = Math.min(r.bottom, win.innerHeight) - Math.max(r.top, 0);
    if (visibleH >= r.height * 0.3) return true;
  }
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
}

/* --------------------------------------------------------------------------
 * localStorage（shirube:hidden）購読（SSR 安全・即座同期）
 * ------------------------------------------------------------------------ */

const hiddenListeners = new Set<() => void>();

function readHiddenStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHIRUBE_HIDDEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHiddenStorage(nextHidden: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (nextHidden) {
      window.localStorage.setItem(SHIRUBE_HIDDEN_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(SHIRUBE_HIDDEN_STORAGE_KEY);
    }
  } catch {
    // プライベートモード等で保存できない場合は無視
  }
  hiddenListeners.forEach((fn) => fn());
}

function subscribeHiddenStorage(onChange: () => void) {
  hiddenListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SHIRUBE_HIDDEN_STORAGE_KEY) onChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    hiddenListeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function useShirubeHidden(): [boolean, (next: boolean) => void] {
  const hidden = useSyncExternalStore(
    subscribeHiddenStorage,
    readHiddenStorage,
    () => false,
  );
  const setHidden = useCallback((next: boolean) => {
    writeHiddenStorage(next);
  }, []);
  return [hidden, setHidden];
}

function isInputCurrentlyFocused(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return active.matches(FORM_INPUT_SELECTOR);
}

function isPage404(): boolean {
  if (typeof document === "undefined") return false;
  const h1 = document.querySelector("h1")?.textContent ?? "";
  return h1.includes("ページが見つかりません");
}

function getActorDimensions(actorEl: HTMLDivElement | null): {
  width: number;
  height: number;
} {
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : false;
  const rect = actorEl?.getBoundingClientRect();
  const fallback = getDefaultActorSize(isMobile);
  return {
    width: rect && rect.width > 0 ? rect.width : fallback.width,
    height: rect && rect.height > 0 ? rect.height : fallback.height,
  };
}

function writeActorPosition(
  actor: HTMLElement | null,
  position: ShirubePosition,
) {
  if (!actor) return;
  actor.style.transform = `translate3d(${position.x.toFixed(2)}px, ${position.top.toFixed(2)}px, 0)`;
}

type DragGesture = {
  id: number;
  clientX: number;
  clientY: number;
  origin: ShirubePosition;
  started: boolean;
};

/* --------------------------------------------------------------------------
 * 本体コンポーネント
 * ------------------------------------------------------------------------ */

export function ShirubeWanderer({
  forceReducedMotion,
  restSide = "right",
  edgeMarginPx = 16,
  avoidBottomObstacles = true,
  gait = "rig",
  greet,
  seed,
  pathnameOverride,
  autoTipMinIntervalMs = DEFAULT_TIP_RATE_LIMIT.minIntervalMs,
  enterTipDelayMs,
  idleTipDelayMs = 45_000,
  onInteract,
  onStatusChange,
}: ShirubeWandererProps) {
  const nextPathname = usePathname();
  const pathname =
    pathnameOverride ??
    nextPathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");

  const [isHidden, setIsHidden] = useShirubeHidden();
  /** ページ側の大きなしるべが見えていて、姿を消している間 true */
  const awayRef = useRef(false);
  const dismissBubbleRef = useRef<(() => void) | null>(null);
  const osReduced = usePrefersReducedMotion();
  const isReduced = forceReducedMotion ?? osReduced;
  const restFacing: WanderFacing = restSide === "left" ? "right" : "left";

  const actorRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<WanderState | null>(null);
  const perchesRef = useRef<Perch[]>([]);
  const bottomLiftRef = useRef<number>(0);
  const randomRef = useRef<() => number>(Math.random);
  const rateLimitRef = useRef<TipRateLimitState>(createTipRateLimitState());
  const tapCursorRef = useRef<number>(0);
  const lastReportedRef = useRef<string>("");
  const onStatusChangeRef = useRef(onStatusChange);
  const bubbleTimerRef = useRef<number>(0);
  const highlightCleanupRef = useRef<(() => void) | null>(null);
  const resumeEngineRef = useRef<(() => void) | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const gestureRef = useRef<DragGesture | null>(null);
  const suppressClickRef = useRef(false);
  const menuOpenRef = useRef(false);
  const [menuTrigger, setMenuTrigger] = useState<HTMLButtonElement | null>(
    null,
  );
  const menuOpen = menuTrigger !== null;
  const [dragging, setDragging] = useState(false);
  const droppedRef = useRef<ShirubePosition | null>(null);
  const [drop, setDrop] = useState<ShirubePosition | null>(null);
  const returnDelayRef = useRef({ remaining: 0 });
  const returnHomeRef = useRef<(() => void) | null>(null);

  const interactionPaused = useCallback(
    () => menuOpenRef.current || !!gestureRef.current?.started,
    [],
  );

  const closeMenu = useCallback(() => {
    menuOpenRef.current = false;
    setMenuTrigger(null);
    triggerRef.current?.focus({ preventScroll: true });
    resumeEngineRef.current?.();
  }, []);

  const fitPosition = useCallback(
    (position: ShirubePosition, avoid: boolean) => {
      const safe =
        stageRef.current && window.getComputedStyle(stageRef.current);
      return placeDroppedShirube(
        position,
        getActorDimensions(actorRef.current),
        {
          left: parseFloat(safe?.paddingLeft || "") || 0,
          top: parseFloat(safe?.paddingTop || "") || 0,
          right: getLayoutWidth() - (parseFloat(safe?.paddingRight || "") || 0),
          bottom:
            window.innerHeight - (parseFloat(safe?.paddingBottom || "") || 0),
        },
        avoid ? collectBubbleBlockers() : [],
      );
    },
    [],
  );

  const returnHome = useCallback(() => {
    const position = droppedRef.current;
    droppedRef.current = null;
    if (position) setDrop(null);
    if (isReduced) {
      if (actorRef.current) actorRef.current.style.transform = "";
      return;
    }
    if (position && stateRef.current) {
      stateRef.current = {
        ...stateRef.current,
        x: position.x,
        y: position.top + getActorDimensions(actorRef.current).height,
        perchId: "drop",
        hop: null,
        phase: "paused",
      };
    }
    returnHomeRef.current?.();
  }, [isReduced]);

  useEffect(() => {
    if (isHidden || menuOpen || dragging || !drop) return;
    const started = performance.now();
    const delay = returnDelayRef.current;
    const timer = window.setTimeout(() => {
      if (!interactionPaused()) returnHome();
    }, delay.remaining);
    return () => {
      window.clearTimeout(timer);
      delay.remaining = Math.max(
        0,
        delay.remaining - (performance.now() - started),
      );
    };
  }, [dragging, drop, interactionPaused, isHidden, menuOpen, returnHome]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    randomRef.current =
      typeof seed === "number" && Number.isFinite(seed)
        ? createSeededRandom(seed)
        : Math.random;
  }, [seed]);

  const [activeVisual, setActiveVisual] = useState<{
    state: WanderPhase;
    prevState: WanderPhase | null;
    facing: WanderFacing;
    perchId: string;
    isLanding: boolean;
    isTurningBack: boolean;
  }>({
    state: "walking",
    prevState: null,
    facing: restFacing,
    perchId: "bottom",
    isLanding: false,
    isTurningBack: false,
  });

  const [activeTip, setActiveTip] = useState<ShirubeTip | null>(null);
  const [bubbleAnchor, setBubbleAnchor] = useState<BubbleAnchorState | null>(
    null,
  );
  // 動きを減らす設定のときの吹き出し位置（静止位置から計算）
  const [reducedBubbleAnchor, setReducedBubbleAnchor] =
    useState<BubbleAnchorState | null>(null);

  const reportStatus = useCallback(
    (
      motion: "active" | "reduced",
      nextState: ShirubeWanderVisualState,
      nextFacing: WanderFacing,
      perchId: string,
      tipId: string | null,
      hidden: boolean,
    ) => {
      const key = `${motion}:${nextState}:${nextFacing}:${perchId}:${tipId ?? ""}:${hidden}`;
      if (lastReportedRef.current === key) return;
      lastReportedRef.current = key;
      onStatusChangeRef.current?.({
        motion,
        state: nextState,
        facing: nextFacing,
        perchId,
        tipId,
        hidden,
      });
    },
    [],
  );

  const clearHighlight = useCallback(() => {
    highlightCleanupRef.current?.();
    highlightCleanupRef.current = null;
  }, []);

  const highlightTargetElement = useCallback(
    (el: Element | null) => {
      clearHighlight();
      if (!el || typeof window === "undefined") return;
      el.classList.add(TARGET_HIGHLIGHT_CLASS);
      const timer = window.setTimeout(() => {
        el.classList.remove(TARGET_HIGHLIGHT_CLASS);
        highlightCleanupRef.current = null;
      }, TARGET_HIGHLIGHT_MS);
      highlightCleanupRef.current = () => {
        window.clearTimeout(timer);
        el.classList.remove(TARGET_HIGHLIGHT_CLASS);
      };
    },
    [clearHighlight],
  );

  const dismissBubble = useCallback(() => {
    if (bubbleTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = 0;
    }
    clearHighlight();
    setActiveTip(null);
    const current = stateRef.current;
    if (current && current.phase === "pointing") {
      stateRef.current = {
        ...current,
        phase: "paused",
        remainingMs: 700,
        glancedDuringPause: true,
      };
      resumeEngineRef.current?.();
    }
  }, [clearHighlight]);

  useEffect(() => {
    dismissBubbleRef.current = dismissBubble;
  }, [dismissBubble]);

  const hideShirube = useCallback(() => {
    dismissBubble();
    setIsHidden(true);
  }, [dismissBubble, setIsHidden]);

  const restoreShirube = useCallback(() => {
    setIsHidden(false);
  }, [setIsHidden]);

  /**
   * 吹き出しを表示し、画面内に対象があれば指さし＋金の縁取りを行う。
   * 自動の案内（auto）は、吹き出しがボタンやリンクに重ならない置き場所が
   * 無ければ出さずに false を返す（タップされたときは一番ましな場所に出す）。
   */
  const presentTip = useCallback(
    (
      tip: ShirubeTip,
      explicitTarget?: Element | null,
      opts: { auto?: boolean } = {},
    ): boolean => {
      if (typeof window === "undefined") return false;

      const resolvedTarget =
        explicitTarget ??
        (tip.target ? resolveTipTarget(tip.target, document, tip.id) : null);
      const inViewTarget =
        resolvedTarget && isElementInViewport(resolvedTarget, window)
          ? resolvedTarget
          : null;

      const dims = getActorDimensions(actorRef.current);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const blockers = collectBubbleBlockers(document, window);
      const linkCount = tip.links?.length ?? (tip.link ? 1 : 0);
      const size = bubbleSize(vw, tip.text, linkCount);
      const minLeft = getContentLeft(document, window);

      let nextState: WanderState | null = null;
      let anchor: BubbleAnchorState;
      const dropped = droppedRef.current;
      if (dropped) {
        anchor = {
          x: dropped.x,
          y: dropped.top + dims.height,
          actorWidth: dims.width,
          actorHeight: dims.height,
          viewportWidth: vw,
          minLeft,
          viewportHeight: vh,
          blockers,
        };
      } else if (!isReduced && stateRef.current) {
        nextState = stateRef.current;
        if (inViewTarget && perchesRef.current.length > 0) {
          const r = inViewTarget.getBoundingClientRect();
          nextState = startPointingToward(
            stateRef.current,
            { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
            {
              perches: perchesRef.current,
              actorWidth: dims.width,
              actorHeight: dims.height,
              viewportHeight: vh,
            },
            BUBBLE_AUTO_HIDE_MS,
          );
        }
        anchor = {
          x: nextState.hop ? nextState.hop.toX : nextState.x,
          y: nextState.hop ? nextState.hop.toY : nextState.y,
          actorWidth: dims.width,
          actorHeight: dims.height,
          viewportWidth: vw,
          minLeft,
          viewportHeight: vh,
          blockers,
        };
      } else {
        // 動きを減らす設定: 右下（または左下）に静止している位置
        anchor = {
          x:
            restSide === "left"
              ? 16
              : getLayoutWidth(window) -
                getRightMarginPx(stageRef.current, getLayoutWidth(window)) -
                dims.width,
          y: vh - bottomLiftRef.current,
          actorWidth: dims.width,
          actorHeight: dims.height,
          viewportWidth: vw,
          minLeft,
          viewportHeight: vh,
          blockers,
        };
      }

      // スマホでは、ボタンやリンクに重ならない置き場所が無ければ自動の案内は出さない。
      // PC は重ならない場所を優先して選ぶが、見つからなくても出す（画面が広く、7 秒で消える）。
      if (
        opts.auto &&
        vw < 640 &&
        !chooseBubblePlacement(anchor, size, blockers).safe
      ) {
        return false;
      }

      if (bubbleTimerRef.current) {
        window.clearTimeout(bubbleTimerRef.current);
      }
      if (inViewTarget) {
        highlightTargetElement(inViewTarget);
      } else {
        clearHighlight();
      }
      setActiveTip(tip);
      setBubbleAnchor(isReduced ? null : anchor);
      if (nextState && nextState !== stateRef.current) {
        stateRef.current = nextState;
        resumeEngineRef.current?.();
      }
      if (isReduced) setReducedBubbleAnchor(anchor);

      bubbleTimerRef.current = window.setTimeout(() => {
        bubbleTimerRef.current = 0;
        setActiveTip(null);
      }, BUBBLE_AUTO_HIDE_MS);
      return true;
    },
    [clearHighlight, highlightTargetElement, isReduced, restSide],
  );

  /** 自動案内トリガー（頻度制限・入力欄フォーカス回避あり） */
  const triggerAutoTip = useCallback(
    (
      trigger: ShirubeTipTrigger,
      overrideTip?: ShirubeTip,
      explicitTarget?: Element | null,
    ) => {
      if (isHidden || awayRef.current || interactionPaused()) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      const tips = getTipsForRoute(pathname, { is404: isPage404() });
      const candidate =
        overrideTip ??
        chooseTipForTrigger(tips, trigger, rateLimitRef.current.shownIds);
      if (!candidate) return;

      const now = Date.now();
      const allowed = canShowAutoTip(
        rateLimitRef.current,
        now,
        {
          minIntervalMs: autoTipMinIntervalMs,
          maxPerPageView: DEFAULT_TIP_RATE_LIMIT.maxPerPageView,
        },
        {
          inputFocused: isInputCurrentlyFocused(),
          tipId: candidate.id,
          priority: trigger === "result",
        },
      );
      if (!allowed) return;

      // target が必須（allowH1Fallback === false）のチップは画面内に見つからなければ出さない
      let targetEl = explicitTarget ?? null;
      if (!targetEl && candidate.target) {
        const resolved = resolveTipTarget(
          candidate.target,
          document,
          candidate.id,
        );
        const allowFallback =
          typeof candidate.target === "object"
            ? candidate.target.allowH1Fallback !== false
            : true;
        if (resolved && isElementInViewport(resolved, window)) {
          targetEl = resolved;
        } else if (!allowFallback) {
          return;
        }
      }

      if (!presentTip(candidate, targetEl, { auto: true })) return;
      rateLimitRef.current = recordAutoTipShown(
        rateLimitRef.current,
        now,
        candidate.id,
      );
    },
    [autoTipMinIntervalMs, interactionPaused, isHidden, pathname, presentTip],
  );

  /** タップ時: 今のページに合った案内・次の一歩を表示（移動操作はしない） */
  const handleTapForTip = useCallback(() => {
    // 未入力の必須欄が見えていれば、それが「次の一歩」
    const emptyField = findEmptyRequiredInput(document, window);
    if (emptyField) {
      presentTip(FORM_NEXT_INPUT_TIP, emptyField);
      return;
    }
    const tips = getTipsForRoute(pathname, { is404: isPage404() });
    // 画面の上の方〜中ほどにはっきり見えている所の案内を、まだ出していないものから優先する
    const clearlyVisible = (t: ShirubeTip) => {
      if (!t.target) return false;
      const el = resolveTipTarget(t.target, document, t.id);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight * 0.85;
    };
    const shown = rateLimitRef.current.shownIds;
    const fresh = chooseTipForTap(
      tips,
      tapCursorRef.current,
      (t) => !shown.includes(t.id) && clearlyVisible(t),
    );
    const { tip, nextIndex } = clearlyVisible(fresh.tip)
      ? fresh
      : chooseTipForTap(tips, tapCursorRef.current, clearlyVisible);
    tapCursorRef.current = nextIndex;
    presentTip(tip);
  }, [pathname, presentTip]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || gestureRef.current || menuOpenRef.current) return;
    suppressClickRef.current = false;
    const rect = actorRef.current?.getBoundingClientRect();
    if (!rect) return;
    gestureRef.current = {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: { x: rect.left, top: rect.top },
      started: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.clientX;
    const dy = event.clientY - gesture.clientY;
    if (!gesture.started) {
      if (!exceedsDragThreshold(dx, dy)) return;
      gesture.started = true;
      suppressClickRef.current = true;
      dismissBubble();
      setDragging(true);
      resumeEngineRef.current?.();
      // reduced-motion の CSS 定位置を外してから、画面座標で移動する。
      stageRef.current?.setAttribute("data-positioned", "true");
    }
    const position = { x: gesture.origin.x + dx, top: gesture.origin.top + dy };
    writeActorPosition(actorRef.current, fitPosition(position, false));
    return position;
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    const position = cancelled ? undefined : movePointer(event);
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!gesture.started) return;
    if (!position && !droppedRef.current)
      stageRef.current?.removeAttribute("data-positioned");
    setDragging(false);
    if (position) {
      const dropped = fitPosition(position, true);
      droppedRef.current = dropped;
      returnDelayRef.current = {
        remaining: nextAwayDelay(
          getWanderConfig(window.innerWidth),
          randomRef.current,
        ),
      };
      setDrop(dropped);
      writeActorPosition(actorRef.current, dropped);
    } else if (droppedRef.current) {
      writeActorPosition(actorRef.current, droppedRef.current);
    } else if (isReduced) {
      if (actorRef.current) actorRef.current.style.transform = "";
    } else {
      resumeEngineRef.current?.();
    }
  };

  // ルート変更時に自動案内カウンタをリセット
  useEffect(() => {
    rateLimitRef.current = createTipRateLimitState();
    tapCursorRef.current = 0;
    if (menuOpenRef.current) closeMenu();
  }, [closeMenu, pathname]);

  useEffect(() => {
    if ((onInteract || isHidden) && menuOpenRef.current) closeMenu();
  }, [closeMenu, isHidden, onInteract]);

  // 吹き出しは画面に固定なので、大きくスクロールしたら閉じる
  // （ページが動いた後にボタンや文字の上へ残らないように）
  useEffect(() => {
    if (!activeTip) return;
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 120) dismissBubble();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [activeTip, dismissBubble]);

  // Esc キーで吹き出しを閉じる
  useEffect(() => {
    if (!activeTip) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissBubble();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTip, dismissBubble]);

  // アンマウント時のタイマー・強調解除
  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(bubbleTimerRef.current);
      }
      clearHighlight();
    };
  }, [clearHighlight]);

  // 画面下の固定ボタン帯（--shirube-lift）と床（perch）の計測・更新
  useEffect(() => {
    if (isHidden || typeof window === "undefined") return;
    const stage = stageRef.current;

    let raf = 0;
    let lastLift = -1;

    const measureAll = () => {
      raf = 0;
      if (document.visibilityState === "hidden") return;

      // 0. ページに大きなしるべが見えている間は姿を消す
      const away = isOtherShirubeVisible(document, window);
      if (away !== awayRef.current) {
        awayRef.current = away;
        if (stage) stage.setAttribute("data-away", away ? "true" : "false");
        if (away) {
          dismissBubbleRef.current?.();
          if (menuOpenRef.current) closeMenu();
        }
      }

      // 1. 下部固定 CTA の持ち上げ量
      let lift = 0;
      if (avoidBottomObstacles && stage) {
        lift = computeBottomLift(
          collectBottomObstacles(document, window),
          window.innerHeight,
        );
        if (lift !== lastLift) {
          lastLift = lift;
          stage.style.setProperty("--shirube-lift", `${lift}px`);
          stage.setAttribute("data-lifted", lift > 0 ? "true" : "false");
        }
      } else if (stage) {
        stage.style.removeProperty("--shirube-lift");
        stage.removeAttribute("data-lifted");
      }
      const safeBottom = stage
        ? parseFloat(window.getComputedStyle(stage).paddingBottom) || 0
        : 0;
      bottomLiftRef.current = isReduced
        ? lift + safeBottom
        : Math.max(lift, safeBottom);

      // 2. ビューポート内の床（perch）一覧を更新
      const dims = getActorDimensions(actorRef.current);
      const candidates = collectPerchCandidates(document, window, undefined, {
        actorHeight: dims.height,
      });
      const avoidRects = collectAvoidRects(document, window);
      const layoutW = getLayoutWidth(window);
      const perches = findPerches(
        candidates,
        { width: layoutW, height: window.innerHeight },
        {
          actorWidth: dims.width,
          actorHeight: dims.height,
          edgeMarginPx,
          rightEdgeMarginPx: getRightMarginPx(stage, layoutW),
          contentLeftPx: getContentLeft(document, window),
          bottomLiftPx: bottomLiftRef.current,
          avoidRects,
        },
      );
      perchesRef.current = perches;
      // 確認用: いま乗れる床の数（見た目には影響しない）
      stage?.setAttribute("data-perches", String(perches.length));

      // 現在乗っている床が動いた／消えた場合の追従
      if (interactionPaused()) return;
      if (droppedRef.current) {
        const fitted = fitPosition(droppedRef.current, true);
        droppedRef.current = fitted;
        writeActorPosition(actorRef.current, fitted);
      } else if (!isReduced && stateRef.current) {
        const roam: RoamContext = {
          perches,
          actorWidth: dims.width,
          actorHeight: dims.height,
          viewportHeight: window.innerHeight,
        };
        const reconciled = reconcilePerch(
          stateRef.current,
          roam,
          randomRef.current,
        );
        if (reconciled !== stateRef.current) {
          stateRef.current = reconciled;
          if (actorRef.current) {
            actorRef.current.style.transform = `translate3d(${reconciled.x.toFixed(2)}px, ${(reconciled.y - dims.height).toFixed(2)}px, 0)`;
          }
          if (reconciled.phase === "hopping") {
            resumeEngineRef.current?.();
          }
        }
      }
    };

    const schedule = () => {
      if (raf || typeof window.requestAnimationFrame !== "function") return;
      raf = window.requestAnimationFrame(measureAll);
    };

    measureAll();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", schedule);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      const mainEl = document.querySelector("main") ?? document.body;
      if (mainEl) {
        ro = new ResizeObserver(schedule);
        ro.observe(mainEl);
      }
    }

    const interval = window.setInterval(schedule, 2500);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", schedule);
      window.clearInterval(interval);
      ro?.disconnect();
      if (raf && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [
    avoidBottomObstacles,
    closeMenu,
    edgeMarginPx,
    fitPosition,
    interactionPaused,
    isHidden,
    isReduced,
  ]);

  // 自由移動エンジン（移動・ジャンプ中だけ rAF、停止中はタイマーで省電力化）
  useEffect(() => {
    const actor = actorRef.current;

    if (isHidden) {
      stateRef.current = null;
      reportStatus(
        isReduced ? "reduced" : "active",
        isReduced ? "idle" : "paused",
        restFacing,
        "bottom",
        null,
        true,
      );
      return;
    }

    if (isReduced) {
      stateRef.current = null;
      if (droppedRef.current) {
        writeActorPosition(actor, droppedRef.current);
      } else if (actor) {
        actor.style.transform = "";
      }
      reportStatus(
        "reduced",
        "idle",
        restFacing,
        "bottom",
        activeTip?.id ?? null,
        false,
      );
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const dims = getActorDimensions(actorRef.current);
    const initialBottomY = Math.max(
      dims.height,
      window.innerHeight - bottomLiftRef.current,
    );
    const layoutW = getLayoutWidth(window);
    const rightMargin = getRightMarginPx(stageRef.current, layoutW);
    const initialBounds = withContentLeft(
      getWanderBounds(layoutW, dims.width, edgeMarginPx, rightMargin),
      getContentLeft(document, window),
      edgeMarginPx,
    );
    const initialConfig = getWanderConfig(window.innerWidth, { gait, greet });
    // 定位置（画面右下の端）で、その場の足踏みから始める（移動はときどき）
    const initialState = startStepping(
      createInitialWanderState(
        initialBounds,
        initialConfig,
        randomRef.current,
        initialBottomY,
      ),
      initialBounds,
      initialConfig,
      randomRef.current,
      initialBounds.maxX,
    );
    stateRef.current = initialState;

    if (perchesRef.current.length === 0) {
      perchesRef.current = findPerches(
        [],
        { width: layoutW, height: window.innerHeight },
        {
          actorWidth: dims.width,
          actorHeight: dims.height,
          edgeMarginPx,
          rightEdgeMarginPx: rightMargin,
          contentLeftPx: getContentLeft(document, window),
          bottomLiftPx: bottomLiftRef.current,
        },
      );
    }

    const applyTransform = (s: WanderState, height: number) => {
      if (!actorRef.current) return;
      writeActorPosition(actorRef.current, { x: s.x, top: s.y - height });
    };

    if (!droppedRef.current) applyTransform(initialState, dims.height);
    // 見た目（data-state / data-facing）を最初の状態にそろえる。
    // これが無いと、初期表示の向きと内部の向きが食い違ったまま歩き出し、
    // 後ろ向きに進む（ムーンウォーク）ことがあった。
    setActiveVisual({
      state: initialState.phase,
      prevState: null,
      facing: initialState.facing,
      perchId: initialState.perchId,
      isLanding: false,
      isTurningBack: false,
    });
    reportStatus(
      "active",
      initialState.phase,
      initialState.facing,
      initialState.perchId,
      activeTip?.id ?? null,
      false,
    );

    let rafId = 0;
    let sleepTimerId = 0;
    let landClassTimer = 0;
    let turnBackTimer = 0;
    let lastTs = performance.now();
    let syncedPhase: WanderPhase = initialState.phase;
    let syncedFacing: WanderFacing = initialState.facing;
    let syncedPerchId: string = initialState.perchId;
    let disposed = false;

    const clearTransientTimers = () => {
      if (landClassTimer) {
        window.clearTimeout(landClassTimer);
        landClassTimer = 0;
      }
      if (turnBackTimer) {
        window.clearTimeout(turnBackTimer);
        turnBackTimer = 0;
      }
    };

    const syncVisual = (next: WanderState) => {
      const phaseChanged = next.phase !== syncedPhase;
      const facingChanged = next.facing !== syncedFacing;
      const perchChanged = next.perchId !== syncedPerchId;
      if (!phaseChanged && !facingChanged && !perchChanged) return;

      const prevPhase = syncedPhase;
      syncedPhase = next.phase;
      syncedFacing = next.facing;
      syncedPerchId = next.perchId;

      const landedNow = prevPhase === "hopping" && next.phase !== "hopping";
      const turnedBackNow =
        FRONT_FACING_PHASES.has(prevPhase) &&
        SIDE_FACING_PHASES.has(next.phase);

      setActiveVisual({
        state: next.phase,
        prevState: prevPhase,
        facing: next.facing,
        perchId: next.perchId,
        isLanding: landedNow,
        isTurningBack: turnedBackNow,
      });

      if (landedNow) {
        if (landClassTimer) window.clearTimeout(landClassTimer);
        landClassTimer = window.setTimeout(() => {
          setActiveVisual((v) =>
            v.isLanding ? { ...v, isLanding: false } : v,
          );
        }, 260);
      }

      if (turnedBackNow) {
        if (turnBackTimer) window.clearTimeout(turnBackTimer);
        turnBackTimer = window.setTimeout(() => {
          setActiveVisual((v) =>
            v.isTurningBack ? { ...v, isTurningBack: false } : v,
          );
        }, 320);
      }

      if (next.phase === "pointing") {
        const d = getActorDimensions(actorRef.current);
        setBubbleAnchor((prev) => ({
          x: next.x,
          y: next.y,
          actorWidth: d.width,
          actorHeight: d.height,
          viewportWidth: window.innerWidth,
          minLeft: getContentLeft(document, window),
          viewportHeight: window.innerHeight,
          blockers: prev?.blockers ?? [],
        }));
      }

      reportStatus(
        "active",
        next.phase,
        next.facing,
        next.perchId,
        activeTip?.id ?? null,
        false,
      );
    };

    const buildRoamContext = () => {
      const d = getActorDimensions(actorRef.current);
      const vw = getLayoutWidth(window);
      const vh = window.innerHeight;
      const rm = getRightMarginPx(stageRef.current, vw);
      const perches =
        perchesRef.current.length > 0
          ? perchesRef.current
          : findPerches(
              [],
              { width: vw, height: vh },
              {
                actorWidth: d.width,
                actorHeight: d.height,
                edgeMarginPx,
                rightEdgeMarginPx: rm,
                contentLeftPx: getContentLeft(document, window),
                bottomLiftPx: bottomLiftRef.current,
              },
            );
      return {
        dims: d,
        bounds: withContentLeft(
          getWanderBounds(vw, d.width, edgeMarginPx, rm),
          getContentLeft(document, window),
          edgeMarginPx,
        ),
        config: getWanderConfig(vw, { gait, greet }),
        roam: {
          perches,
          actorWidth: d.width,
          actorHeight: d.height,
          viewportHeight: vh,
        } satisfies RoamContext,
      };
    };

    const stopLoops = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (sleepTimerId) {
        window.clearTimeout(sleepTimerId);
        sleepTimerId = 0;
      }
    };

    const enginePaused = () => interactionPaused() || !!droppedRef.current;
    const scheduleNext = (state: WanderState, fromTick = false) => {
      if (disposed || enginePaused() || document.visibilityState === "hidden")
        return;
      const needsRaf =
        state.phase === "walking" ||
        state.phase === "hopping" ||
        state.phase === "stepping";
      if (needsRaf) {
        if (!rafId) {
          // rAF の続きのときは、そのコマの時刻（tick で入れた lastTs）をそのまま使う。
          // ここで now を入れ直すと、毎コマの処理時間ぶん時間が抜け落ち、
          // 重い端末ほどしるべがゆっくり歩いてしまう（録画中は約 6 割の速さだった）。
          if (!fromTick) lastTs = performance.now();
          rafId = window.requestAnimationFrame(tick);
        }
        return;
      }
      // 静止フェーズでは rAF を止め、次の遷移時刻までタイマー待機する
      const waitMs = Math.max(
        120,
        Math.min(state.remainingMs > 0 ? state.remainingMs : 400, 1400),
      );
      if (sleepTimerId) window.clearTimeout(sleepTimerId);
      sleepTimerId = window.setTimeout(() => {
        sleepTimerId = 0;
        if (disposed || enginePaused() || document.visibilityState === "hidden")
          return;
        const current = stateRef.current;
        if (!current) return;
        const { dims: d, bounds, config, roam } = buildRoamContext();
        const next = stepWanderState(
          current,
          waitMs,
          bounds,
          config,
          randomRef.current,
          roam,
        );
        stateRef.current = next;
        applyTransform(next, d.height);
        syncVisual(next);
        scheduleNext(next);
      }, waitMs);
    };

    const tick = (now: number) => {
      rafId = 0;
      if (disposed || enginePaused() || document.visibilityState === "hidden")
        return;

      const elapsed = now - lastTs;
      lastTs = now;

      const current = stateRef.current;
      if (!current) return;

      const { dims: d, bounds, config, roam } = buildRoamContext();
      const next = stepWanderState(
        current,
        elapsed,
        bounds,
        config,
        randomRef.current,
        roam,
      );
      stateRef.current = next;
      applyTransform(next, d.height);
      syncVisual(next);
      scheduleNext(next, true);
    };

    const resumeEngine = () => {
      stopLoops();
      if (disposed || enginePaused() || document.visibilityState === "hidden")
        return;
      const current = stateRef.current;
      if (!current) return;
      const d = getActorDimensions(actorRef.current);
      applyTransform(current, d.height);
      syncVisual(current);
      scheduleNext(current);
    };
    resumeEngineRef.current = resumeEngine;
    returnHomeRef.current = () => {
      const current = stateRef.current;
      if (!current) return;
      const { config, roam } = buildRoamContext();
      stateRef.current = returnShirubeHome(current, roam, config);
      resumeEngine();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopLoops();
      } else {
        resumeEngine();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    scheduleNext(initialState);

    return () => {
      disposed = true;
      resumeEngineRef.current = null;
      returnHomeRef.current = null;
      stopLoops();
      clearTransientTimers();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // activeTip は状態表示専用のためループを再起動しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isHidden,
    isReduced,
    restFacing,
    edgeMarginPx,
    gait,
    greet,
    seed,
    interactionPaused,
  ]);

  // activeTip 変化をデモ用スナップショットへ反映
  useEffect(() => {
    const visualState: ShirubeWanderVisualState = isReduced
      ? "idle"
      : activeVisual.state;
    const facing: WanderFacing = isReduced ? restFacing : activeVisual.facing;
    reportStatus(
      isReduced ? "reduced" : "active",
      visualState,
      facing,
      activeVisual.perchId,
      activeTip?.id ?? null,
      isHidden,
    );
  }, [activeTip, activeVisual, isHidden, isReduced, reportStatus, restFacing]);

  // 自動案内トリガー（入室 / スクロール / 結果表示 / 無操作 / 空状態）
  useEffect(() => {
    if (isHidden || typeof window === "undefined") return;

    // 1. 入室トリガー（6〜10 秒後。空状態が見えていれば empty を優先）
    const delay =
      enterTipDelayMs ?? Math.round(6000 + randomRef.current() * 4000);
    const enterTimer = window.setTimeout(() => {
      const emptyEl = document.querySelector("[data-empty-state]");
      if (emptyEl && isElementInViewport(emptyEl, window)) {
        const tips = getTipsForRoute(pathname, { is404: isPage404() });
        const routeEmpty = chooseTipForTrigger(
          tips,
          "empty",
          rateLimitRef.current.shownIds,
        );
        triggerAutoTip("empty", routeEmpty ?? GENERIC_EMPTY_TIP, emptyEl);
        return;
      }
      triggerAutoTip("enter");
    }, delay);

    // 2. スクロールトリガー（デバウンス 600ms）
    let scrollTimer = 0;
    const seenSections = new WeakSet<Element>();
    const onScroll = () => {
      if (document.visibilityState === "hidden") return;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0;
        if (interactionPaused()) return;
        const emptyEl = document.querySelector("[data-empty-state]");
        if (
          emptyEl &&
          !seenSections.has(emptyEl) &&
          isElementInViewport(emptyEl, window)
        ) {
          seenSections.add(emptyEl);
          const tips = getTipsForRoute(pathname, { is404: isPage404() });
          const routeEmpty = chooseTipForTrigger(
            tips,
            "empty",
            rateLimitRef.current.shownIds,
          );
          triggerAutoTip("empty", routeEmpty ?? GENERIC_EMPTY_TIP, emptyEl);
          return;
        }
        // 見えてきた所に対応する案内（まだ出していないもの）があれば、それを優先して指さす
        const routeTips = getTipsForRoute(pathname, { is404: isPage404() });
        for (const t of routeTips) {
          if (!t.target || rateLimitRef.current.shownIds.includes(t.id)) {
            continue;
          }
          const el = resolveTipTarget(t.target, document, t.id);
          if (!el || seenSections.has(el)) continue;
          const r = el.getBoundingClientRect();
          if (
            r.top > window.innerHeight * 0.1 &&
            r.bottom < window.innerHeight
          ) {
            seenSections.add(el);
            triggerAutoTip("scroll", t, el);
            return;
          }
        }
        const sections = document.querySelectorAll(
          "main section, main article, main h2, [data-shirube-tip]",
        );
        for (const sec of sections) {
          if (seenSections.has(sec)) continue;
          if (isElementInViewport(sec, window)) {
            seenSections.add(sec);
            triggerAutoTip("scroll");
            break;
          }
        }
      }, 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. 無操作トリガー（既定 45 秒。必須入力欄が未入力なら入力案内を優先）
    let idleTimer = 0;
    const resetIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const emptyInput = findEmptyRequiredInput(document, window);
        if (emptyInput) {
          triggerAutoTip("idle", FORM_NEXT_INPUT_TIP, emptyInput);
          return;
        }
        triggerAutoTip("idle");
      }, idleTipDelayMs);
    };
    resetIdle();
    window.addEventListener("pointerdown", resetIdle, { passive: true });
    window.addEventListener("keydown", resetIdle, { passive: true });
    window.addEventListener("scroll", resetIdle, { passive: true });

    // 4. 結果表示トリガー（MutationObserver: [data-shirube-result] または 吉/凶 を含む [data-verdict]）
    let mutationTimer = 0;
    const seenResults = new WeakSet<Element>();
    // 初期表示からすでに存在する要素は既知として登録しておく
    document
      .querySelectorAll("[data-shirube-result], [data-verdict]")
      .forEach((el) => seenResults.add(el));

    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && document.body) {
      mo = new MutationObserver(() => {
        if (mutationTimer || document.visibilityState === "hidden") return;
        mutationTimer = window.setTimeout(() => {
          mutationTimer = 0;
          if (interactionPaused()) return;
          const nodes = document.querySelectorAll(
            "[data-shirube-result], [data-verdict]",
          );
          for (const el of nodes) {
            if (seenResults.has(el)) continue;
            const isResultAttr = el.hasAttribute("data-shirube-result");
            const text = el.textContent ?? "";
            const hasVerdict = text.includes("吉") || text.includes("凶");
            if (!isResultAttr && !hasVerdict) continue;
            if (!isElementInViewport(el, window)) continue;
            seenResults.add(el);
            const tips = getTipsForRoute(pathname, { is404: isPage404() });
            const routeResult = chooseTipForTrigger(
              tips,
              "result",
              rateLimitRef.current.shownIds,
            );
            triggerAutoTip("result", routeResult ?? GENERIC_RESULT_TIP, el);
            break;
          }
        }, 250);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.clearTimeout(enterTimer);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      if (idleTimer) window.clearTimeout(idleTimer);
      if (mutationTimer) window.clearTimeout(mutationTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      window.removeEventListener("scroll", resetIdle);
      mo?.disconnect();
    };
  }, [
    enterTipDelayMs,
    idleTipDelayMs,
    interactionPaused,
    isHidden,
    pathname,
    triggerAutoTip,
  ]);

  if (isHidden) {
    return <ShirubeHiddenTab onRestore={restoreShirube} />;
  }

  const positioned = dragging || drop !== null;
  const visualState: ShirubeWanderVisualState = isReduced
    ? "idle"
    : positioned || menuOpen
      ? "paused"
      : activeVisual.state;
  const facing: WanderFacing = isReduced ? restFacing : activeVisual.facing;
  const moving =
    visualState === "walking" ||
    visualState === "hopping" ||
    visualState === "turning";

  // 歩く素材は元絵が右向きなので、左へ歩くときだけ左右反転する
  const flipTransform = facing === "left" ? "scaleX(-1)" : "scaleX(1)";

  const stageClassName = [
    "shirube-wander-stage",
    activeVisual.isLanding && !isReduced ? "is-landing" : "",
    activeVisual.isTurningBack && !isReduced ? "is-turning-back" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const avatar = (
    <span className="shirube-wander-gait">
      <span className="shirube-wander-shadow" aria-hidden="true" />
      {gait === "shuffle" && moving ? (
        <span className="shirube-wander-shuffle">
          <ShirubeShuffleSprite displayHeight={168} />
        </span>
      ) : (
        <ShirubeWalkRig />
      )}
    </span>
  );

  return (
    <div
      ref={stageRef}
      className={stageClassName}
      data-testid="shirube-wanderer"
      data-motion={isReduced ? "reduced" : "active"}
      data-state={visualState}
      data-dragging={dragging || undefined}
      data-positioned={positioned || undefined}
      data-prev-state={activeVisual.prevState ?? undefined}
      data-facing={facing}
      data-rest-side={restSide}
      data-gait={gait}
      data-perch={activeVisual.perchId}
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
          <button
            type="button"
            className="shirube-wander-hit"
            ref={triggerRef}
            aria-label={
              onInteract
                ? "しるべに話しかける"
                : "しるべ。メニューを開く。ドラッグで動かせます"
            }
            aria-haspopup={onInteract ? undefined : "menu"}
            aria-expanded={onInteract ? undefined : menuOpen}
            onPointerDown={onPointerDown}
            onPointerMove={movePointer}
            onPointerUp={(event) => finishPointer(event)}
            onPointerCancel={(event) => finishPointer(event, true)}
            onLostPointerCapture={(event) => finishPointer(event, true)}
            onClick={(event) => {
              if (suppressClickRef.current && event.detail !== 0) {
                event.preventDefault();
                return;
              }
              if (onInteract) {
                onInteract();
              } else if (menuOpenRef.current) {
                closeMenu();
              } else {
                menuOpenRef.current = true;
                setMenuTrigger(event.currentTarget);
                dismissBubble();
                resumeEngineRef.current?.();
              }
            }}
          >
            {avatar}
          </button>
        </div>
      </div>

      {menuTrigger && !onInteract ? (
        <ShirubeMenu
          trigger={menuTrigger}
          viewportWidth={getLayoutWidth}
          onClose={closeMenu}
          onTip={() => {
            closeMenu();
            handleTapForTip();
          }}
          onReturnHome={() => {
            closeMenu();
            returnHome();
          }}
        />
      ) : null}

      {activeTip ? (
        <ShirubeBubble
          tip={activeTip}
          anchor={isReduced ? reducedBubbleAnchor : bubbleAnchor}
          reduced={isReduced}
          restSide={restSide}
          onHideShirube={hideShirube}
          onDismissBubble={dismissBubble}
        />
      ) : null}
    </div>
  );
}

export default ShirubeWanderer;
