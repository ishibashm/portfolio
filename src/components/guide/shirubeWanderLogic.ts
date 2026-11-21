/**
 * しるべ歩き回りの状態計算（純粋関数）。
 *
 * 画面最下端をゆっくり歩き、ときどき立ち止まって振り向くリズムを
 * DOM やタイマーから切り離して管理する。
 */

export type WanderFacing = "left" | "right";
export type WanderPhase = "walking" | "paused" | "turning";

export interface WanderBounds {
  minX: number;
  maxX: number;
}

export interface WanderState {
  x: number;
  targetX: number;
  facing: WanderFacing;
  phase: WanderPhase;
  /** paused / turning の残り時間（ms） */
  remainingMs: number;
  /** 立ち止まり中の小さな振り返りを行ったか */
  glancedDuringPause: boolean;
}

export interface WanderConfig {
  /**
   * 歩行速度（px / 秒）。CSS の 1 歩きサイクル（--shirube-cycle）で足が進む距離
   * （表示の高さ × 約 0.234）に合わせ、足が地面を滑って見えないようにする。
   * PC: 120px × 0.234 ÷ 1.08s ≒ 26 / スマホ: 60px × 0.234 ÷ 1s ≒ 14
   */
  speedPxPerSec: number;
  /** 1 回の移動距離の下限（px） */
  minStridePx: number;
  /** 1 回の移動距離の上限（px） */
  maxStridePx: number;
  /** 立ち止まり時間の下限（ms） */
  minPauseMs: number;
  /** 立ち止まり時間の上限（ms） */
  maxPauseMs: number;
  /** 振り返り後の間（ms） */
  turnBeatMs: number;
}

export function getWanderBounds(
  viewportWidth: number,
  actorWidth: number,
  edgeMarginPx = 16,
): WanderBounds {
  const safeViewport = Math.max(0, viewportWidth);
  const safeActor = Math.max(0, actorWidth);
  const minX = Math.min(edgeMarginPx, Math.max(0, safeViewport - safeActor));
  const maxX = Math.max(minX, safeViewport - safeActor - edgeMarginPx);
  return { minX, maxX };
}

export function getWanderConfig(viewportWidth: number): WanderConfig {
  const isCompact = viewportWidth < 640;
  return isCompact
    ? {
        speedPxPerSec: 14,
        minStridePx: 56,
        maxStridePx: 140,
        minPauseMs: 2600,
        maxPauseMs: 4800,
        turnBeatMs: 260,
      }
    : {
        speedPxPerSec: 26,
        minStridePx: 130,
        maxStridePx: 340,
        minPauseMs: 2400,
        maxPauseMs: 5200,
        turnBeatMs: 280,
      };
}

export function clampX(x: number, bounds: WanderBounds): number {
  return Math.min(bounds.maxX, Math.max(bounds.minX, x));
}

export function pickNextTargetX(
  currentX: number,
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
): number {
  const span = bounds.maxX - bounds.minX;
  if (span <= 8) return bounds.minX;

  const stride =
    config.minStridePx +
    random() * Math.max(0, config.maxStridePx - config.minStridePx);

  const canGoLeft =
    currentX - bounds.minX >= Math.min(config.minStridePx, span * 0.4);
  const canGoRight =
    bounds.maxX - currentX >= Math.min(config.minStridePx, span * 0.4);

  let dir: -1 | 1;
  if (canGoLeft && canGoRight) {
    dir = random() < 0.5 ? -1 : 1;
  } else if (canGoLeft) {
    dir = -1;
  } else {
    dir = 1;
  }

  return clampX(currentX + dir * stride, bounds);
}

export function createInitialWanderState(
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
): WanderState {
  // 初期位置は右寄り（邪魔になりにくく、すぐ左へ歩き始められる位置）
  const span = bounds.maxX - bounds.minX;
  const startX = clampX(bounds.minX + span * 0.72, bounds);
  const targetX = pickNextTargetX(startX, bounds, config, random);
  const facing: WanderFacing = targetX >= startX ? "right" : "left";

  return {
    x: startX,
    targetX,
    facing,
    phase: span > 8 ? "walking" : "paused",
    remainingMs: span > 8 ? 0 : config.minPauseMs,
    glancedDuringPause: false,
  };
}

export function stepWanderState(
  prev: WanderState,
  deltaMs: number,
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
): WanderState {
  // タブ復帰時などの大きなフレーム飛びを抑える
  const dt = Math.min(Math.max(0, deltaMs), 100);
  if (dt === 0) return prev;

  const clampedX = clampX(prev.x, bounds);
  const clampedTarget = clampX(prev.targetX, bounds);

  if (bounds.maxX - bounds.minX <= 8) {
    return {
      ...prev,
      x: clampedX,
      targetX: clampedX,
      phase: "paused",
      remainingMs: config.minPauseMs,
    };
  }

  if (prev.phase === "turning") {
    const remaining = prev.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...prev,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
      };
    }
    return {
      ...prev,
      x: clampedX,
      targetX: clampedTarget,
      phase: "walking",
      remainingMs: 0,
    };
  }

  if (prev.phase === "paused") {
    const remaining = prev.remainingMs - dt;

    // 立ち止まりの後半で、ときどき反対側をそっと見渡す
    if (
      !prev.glancedDuringPause &&
      remaining > 900 &&
      remaining < config.minPauseMs * 0.55 &&
      random() < 0.35
    ) {
      return {
        ...prev,
        x: clampedX,
        targetX: clampedTarget,
        facing: prev.facing === "left" ? "right" : "left",
        remainingMs: remaining,
        glancedDuringPause: true,
      };
    }

    if (remaining > 0) {
      return {
        ...prev,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
      };
    }

    const nextTarget = pickNextTargetX(clampedX, bounds, config, random);
    const nextFacing: WanderFacing = nextTarget >= clampedX ? "right" : "left";
    const needsTurn = nextFacing !== prev.facing;

    return {
      x: clampedX,
      targetX: nextTarget,
      facing: nextFacing,
      phase: needsTurn ? "turning" : "walking",
      remainingMs: needsTurn ? config.turnBeatMs : 0,
      glancedDuringPause: false,
    };
  }

  // walking
  const distance = clampedTarget - clampedX;
  const step = (config.speedPxPerSec * dt) / 1000;

  if (Math.abs(distance) <= step) {
    const pauseMs =
      config.minPauseMs +
      random() * Math.max(0, config.maxPauseMs - config.minPauseMs);
    return {
      x: clampedTarget,
      targetX: clampedTarget,
      facing: prev.facing,
      phase: "paused",
      remainingMs: pauseMs,
      glancedDuringPause: false,
    };
  }

  const nextX = clampedX + Math.sign(distance) * step;
  return {
    ...prev,
    x: nextX,
    targetX: clampedTarget,
    facing: distance > 0 ? "right" : "left",
  };
}

/* --------------------------------------------------------------------------
 * 画面下に固定されたボタン帯（固定 CTA・下部ナビ）を避けるための持ち上げ量
 * ------------------------------------------------------------------------ */

export interface BottomObstacleRect {
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** 持ち上げの上限（画面の高さに対する割合）。大きな固定パネルでは持ち上げすぎない。 */
export const MAX_LIFT_RATIO = 0.35;

/**
 * 画面下端に接している固定要素の上端までの距離（px）を返す。
 * しるべはその分だけ上を歩き、下部の主要ボタンに重ならないようにする。
 *
 * - 下端から 24px 以内に接していない要素は無視する。
 * - 画面の上半分から始まる大きな要素（全画面のモーダルなど）は無視する。
 * - 上限は画面の高さ × MAX_LIFT_RATIO。
 */
export function computeBottomLift(
  rects: readonly BottomObstacleRect[],
  viewportHeight: number,
  gapPx = 4,
): number {
  if (viewportHeight <= 0) return 0;
  let lift = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom < viewportHeight - 24) continue;
    if (r.top < viewportHeight * 0.5) continue;
    lift = Math.max(lift, viewportHeight - r.top + gapPx);
  }
  return Math.round(Math.min(lift, viewportHeight * MAX_LIFT_RATIO));
}
