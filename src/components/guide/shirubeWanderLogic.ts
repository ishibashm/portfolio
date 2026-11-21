/**
 * しるべ歩き回りの状態計算（純粋関数）。
 *
 * 画面最下端をゆっくり歩き、ときどき立ち止まって振り向くリズムを
 * DOM やタイマーから切り離して管理する。
 */

export type WanderFacing = "left" | "right";
/**
 * - walking: 歩いている
 * - paused: 立ち止まり（ときどき反対側を見渡す）
 * - turning: 向きを変える短い間
 * - greeting: 正面を向いて手を振っている（立ち止まりの一種）
 */
export type WanderPhase = "walking" | "paused" | "turning" | "greeting";

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
  /** 目的地に着いたとき、正面を向いて手を振る確率（0〜1）。0 なら振らない。 */
  greetChance: number;
  /** 正面を向いている時間の下限（ms） */
  minGreetMs: number;
  /** 正面を向いている時間の上限（ms） */
  maxGreetMs: number;
  /** 正面から横向きに戻ったあと、歩き出すまでの間（ms） */
  afterGreetMs: number;
}

export type WanderGait = "rig" | "shuffle";

export interface WanderConfigOptions {
  /**
   * 歩き方。rig（既定）は部品分けの歩き、shuffle は 4 コマのすり足。
   * すり足は一歩が小さいので、速さを落として足が滑って見えないようにする。
   */
  gait?: WanderGait;
  /** 正面を向いて手を振るか。既定は rig のときだけ true。 */
  greet?: boolean;
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

export function getWanderConfig(
  viewportWidth: number,
  options: WanderConfigOptions = {},
): WanderConfig {
  const isCompact = viewportWidth < 640;
  const gait = options.gait ?? "rig";
  const greet = options.greet ?? gait === "rig";
  const base = isCompact
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
  return {
    ...base,
    // すり足: スマホ 9px/秒・PC 16px/秒（4 コマ 0.96 秒で進む距離に合わせる）
    speedPxPerSec:
      gait === "shuffle" ? (isCompact ? 9 : 16) : base.speedPxPerSec,
    greetChance: greet ? 0.45 : 0,
    minGreetMs: 2600,
    maxGreetMs: 4200,
    afterGreetMs: 700,
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

  if (prev.phase === "greeting") {
    const remaining = prev.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...prev,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
      };
    }
    // 横向きに戻って、少し間を置いてから歩き出す（見渡しは省く）
    return {
      ...prev,
      x: clampedX,
      targetX: clampedTarget,
      phase: "paused",
      remainingMs: config.afterGreetMs,
      glancedDuringPause: true,
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
    // ときどき正面を向いて手を振る
    if (config.greetChance > 0 && random() < config.greetChance) {
      const greetMs =
        config.minGreetMs +
        random() * Math.max(0, config.maxGreetMs - config.minGreetMs);
      return {
        x: clampedTarget,
        targetX: clampedTarget,
        facing: prev.facing,
        phase: "greeting",
        remainingMs: greetMs,
        glancedDuringPause: false,
      };
    }
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
