/**
 * しるべの自由移動・状態計算（純粋関数）。
 *
 * - 1D（画面最下端のみ）の既存インタフェースを維持しつつ、
 *   複数の床（Perch）の間を歩いたり飛び移ったり座ったり指さしたりする
 *   2D 自由移動（roam）を純粋関数で表現する。
 * - `random` を注入可能にし、テストやデモの種固定で決定的に再現できる。
 */

import {
  findNearestPerch,
  pickPerchLandingX,
  type Perch,
} from "@/components/guide/shirubePerch";

export type WanderFacing = "left" | "right";
/**
 * - walking: 現在の床を歩いている
 * - paused: 立ち止まり（ときどき反対側を見渡す）
 * - turning: 向きを変える短い間
 * - greeting: 正面を向いて手を振っている
 * - sitting: 床の上でひと休み（正面ポーズで静かに呼吸）
 * - hopping: 床 A から床 B へ放物線で飛び移っている
 * - pointing: 対象を指さして案内している
 */
export type WanderPhase =
  | "stepping"
  | "walking"
  | "paused"
  | "turning"
  | "greeting"
  | "sitting"
  | "hopping"
  | "pointing";

export type WanderActionKind =
  | "walk"
  | "hop"
  | "greet"
  | "sit"
  | "pause"
  | "step";

export interface WanderBounds {
  minX: number;
  maxX: number;
}

export interface HopArc {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  toPerchId: string;
  /** 放物線の頂点 Y 座標（小さいほど画面の上） */
  apexY: number;
  elapsedMs: number;
  durationMs: number;
  afterPhase?: "paused" | "pointing";
  afterFacing?: WanderFacing;
  afterDurationMs?: number;
}

export interface WanderState {
  x: number;
  /** 現在の床 Y 座標（ビューポート上端からの px。1D 呼び出し時は 0） */
  y: number;
  targetX: number;
  facing: WanderFacing;
  phase: WanderPhase;
  /** paused / turning / greeting / sitting / pointing の残り時間（ms） */
  remainingMs: number;
  /** 立ち止まり中の小さな振り返りを行ったか */
  glancedDuringPause: boolean;
  /** 今いる床の ID（既定 "bottom"） */
  perchId: string;
  /** 要素の床に滞在し続けている時間（ms）。約 8 秒超で別床へ移る */
  perchElapsedMs: number;
  /** 直近 3 回の行動履歴（連続しすぎを防ぐ） */
  recentActions: WanderActionKind[];
  /** 直前にいた床 ID（同じ床への連続ジャンプを避ける） */
  lastPerchId: string | null;
  /** hopping 中の軌道データ */
  hop: HopArc | null;
  /** 次に画面の別の場所へ移るまでの残り時間（ms）。0 以下で移動する */
  relocateInMs: number;
}

export interface RoamContext {
  perches: readonly Perch[];
  actorWidth: number;
  actorHeight: number;
  viewportHeight: number;
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
  /** ひと休み（sitting）時間の下限（ms） */
  minSitMs: number;
  /** ひと休み（sitting）時間の上限（ms） */
  maxSitMs: number;
  /** 要素の床に留まり続ける上限時間（ms） */
  maxPerchStayMs: number;
  /** その場の足踏み（stepping）1 回の長さの下限・上限（ms） */
  minStepMs: number;
  maxStepMs: number;
  /** 足踏み中に前へにじり寄る速さ（px / 秒）と、1 回の最大距離（px） */
  stepDriftPxPerSec: number;
  maxStepDriftPx: number;
  /** 画面の別の場所へ移る（歩いて行く・飛び移る）間隔の下限・上限（ms） */
  minRelocateMs: number;
  maxRelocateMs: number;
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

/** 決定的な疑似乱数生成器（Mulberry32）。テストやデモの種固定に使う。 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

export function getPerchBounds(perch: Perch, actorWidth: number): WanderBounds {
  const minX = perch.left;
  const maxX = Math.max(minX, perch.right - Math.max(0, actorWidth));
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
    minSitMs: 2800,
    maxSitMs: 5000,
    // 足場は上が空いている所だけなので、文字を隠さない。移動の間隔より少し長めの上限
    maxPerchStayMs: 45_000,
    minStepMs: 2200,
    maxStepMs: 5200,
    stepDriftPxPerSec: isCompact ? 3 : 5,
    maxStepDriftPx: isCompact ? 6 : 12,
    minRelocateMs: 15_000,
    maxRelocateMs: 40_000,
  };
}

/** 次に別の場所へ移るまでの時間（15〜40 秒のランダム） */
export function nextRelocateDelay(
  config: WanderConfig,
  random: () => number = Math.random,
): number {
  return (
    config.minRelocateMs +
    random() * Math.max(0, config.maxRelocateMs - config.minRelocateMs)
  );
}

/**
 * その場の足踏みを始める。ときどき向きを変え、前（向いている側）へだけ
 * 数 px にじり寄る。後ろへは決して動かない（ムーンウォーク防止）。
 */
export function startStepping(
  state: WanderState,
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
): WanderState {
  const facing: WanderFacing =
    random() < 0.25
      ? state.facing === "left"
        ? "right"
        : "left"
      : state.facing;
  const dir = facing === "right" ? 1 : -1;
  const drift = random() < 0.35 ? 0 : random() * config.maxStepDriftPx;
  const x = clampX(state.x, bounds);
  let targetX = clampX(x + dir * drift, bounds);
  if (Math.sign(targetX - x) !== 0 && Math.sign(targetX - x) !== dir) {
    targetX = x;
  }
  const stepMs =
    config.minStepMs +
    random() * Math.max(0, config.maxStepMs - config.minStepMs);
  return {
    ...state,
    x,
    targetX,
    facing,
    phase: "stepping",
    remainingMs: stepMs,
    glancedDuringPause: false,
    recentActions: pushAction(state.recentActions, "step"),
    hop: null,
  };
}

/** その場で過ごすときの次の行動（足踏みが基本、ときどき立ち止まり・正面・ひと休み） */
export function pickLocalAction(
  recentActions: readonly WanderActionKind[],
  options: { canGreet: boolean; canSit: boolean },
  random: () => number = Math.random,
): WanderActionKind {
  const base: { action: WanderActionKind; weight: number }[] = [
    { action: "step", weight: 50 },
    { action: "pause", weight: 22 },
    { action: "greet", weight: options.canGreet ? 14 : 0 },
    { action: "sit", weight: options.canSit ? 10 : 0 },
  ];
  const last = recentActions[recentActions.length - 1];
  const adjusted = base
    .filter((e) => e.weight > 0)
    .map((e) => ({
      action: e.action,
      // 足踏みは続いてよい（基本の動き）。それ以外は続けて選びにくくする
      weight:
        e.action !== "step" && e.action === last ? e.weight * 0.3 : e.weight,
    }));
  const total = adjusted.reduce((a, e) => a + e.weight, 0);
  let r = random() * total;
  for (const e of adjusted) {
    r -= e.weight;
    if (r <= 0) return e.action;
  }
  return "step";
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

/** 要素の床の上で歩く先を選ぶ。本文を塞がないよう左右 20% の端を優先する。 */
function pickTargetOnPerch(
  currentX: number,
  perch: Perch,
  actorWidth: number,
  config: WanderConfig,
  random: () => number,
): number {
  const bounds = getPerchBounds(perch, actorWidth);
  if (perch.kind === "bottom") {
    return pickNextTargetX(currentX, bounds, config, random);
  }
  const mid = (bounds.minX + bounds.maxX) * 0.5;
  const preferSide = currentX < mid ? "right" : "left";
  return pickPerchLandingX(perch, actorWidth, random, preferSide);
}

export function createInitialWanderState(
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
  initialY = 0,
): WanderState {
  // 初期位置は右寄り（邪魔になりにくく、すぐ左へ歩き始められる位置）
  const span = bounds.maxX - bounds.minX;
  const startX = clampX(bounds.minX + span * 0.72, bounds);
  const targetX = pickNextTargetX(startX, bounds, config, random);
  const facing: WanderFacing = targetX >= startX ? "right" : "left";

  return {
    x: startX,
    y: initialY,
    targetX,
    facing,
    phase: span > 8 ? "walking" : "paused",
    remainingMs: span > 8 ? 0 : config.minPauseMs,
    glancedDuringPause: false,
    perchId: "bottom",
    perchElapsedMs: 0,
    recentActions: ["walk"],
    lastPerchId: null,
    hop: null,
    // 最初の移動は少し早め（8〜16 秒後）。以降は 15〜40 秒ごと
    relocateInMs: 8000 + random() * 8000,
  };
}

function pushAction(
  recent: readonly WanderActionKind[],
  action: WanderActionKind,
): WanderActionKind[] {
  return [...recent.slice(-2), action];
}

/**
 * 放物線ジャンプ（HopArc）を計画する。
 * 所要時間 450〜700ms、頂点は高い方の床より 40〜90px 上。
 */
export function planHopToPerch(
  fromX: number,
  fromY: number,
  targetPerch: Perch,
  toX: number,
  actorHeight: number,
  options: {
    afterPhase?: "paused" | "pointing";
    afterFacing?: WanderFacing;
    afterDurationMs?: number;
  } = {},
): HopArc {
  const toY = targetPerch.top;
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const durationMs = Math.round(
    Math.min(700, Math.max(450, 450 + dist * 0.45)),
  );
  const apexLift = Math.min(90, Math.max(40, 40 + dist * 0.1));
  const higherFloor = Math.min(fromY, toY);
  const minSafeApex = Math.max(actorHeight + 4, 24);
  const apexY = Math.max(
    minSafeApex,
    Math.min(higherFloor, higherFloor - apexLift),
  );

  return {
    fromX,
    fromY,
    toX,
    toY,
    toPerchId: targetPerch.id,
    apexY,
    elapsedMs: 0,
    durationMs,
    afterPhase: options.afterPhase,
    afterFacing: options.afterFacing,
    afterDurationMs: options.afterDurationMs,
  };
}

/** 放物線ジャンプの時刻経過に応じた (x, y) を返す。 */
export function evaluateHopPosition(hop: HopArc): {
  x: number;
  y: number;
  progress: number;
} {
  const t =
    hop.durationMs <= 0
      ? 1
      : Math.min(1, Math.max(0, hop.elapsedMs / hop.durationMs));
  const x = hop.fromX + (hop.toX - hop.fromX) * t;
  const linearY = hop.fromY + (hop.toY - hop.fromY) * t;
  const midY = 0.5 * (hop.fromY + hop.toY);
  const archOffset = Math.max(0, midY - hop.apexY);
  const y = linearY - 4 * t * (1 - t) * archOffset;
  return { x, y, progress: t };
}

/**
 * 次の行動を重み付きランダムで選ぶ（直近 3 回の履歴を見て単調さを避ける）。
 */
export function pickNextRoamAction(
  recentActions: readonly WanderActionKind[],
  options: {
    canWalk: boolean;
    canHop: boolean;
    canGreet: boolean;
    canSit: boolean;
  },
  random: () => number = Math.random,
): WanderActionKind {
  const baseWeights: { action: WanderActionKind; weight: number }[] = [
    { action: "walk", weight: options.canWalk ? 44 : 0 },
    { action: "hop", weight: options.canHop ? 18 : 0 },
    { action: "greet", weight: options.canGreet ? 14 : 0 },
    { action: "sit", weight: options.canSit ? 14 : 0 },
    { action: "pause", weight: 10 },
  ];

  const last = recentActions[recentActions.length - 1];
  const adjusted = baseWeights
    .filter((entry) => entry.weight > 0)
    .map((entry) => {
      let factor = 1;
      if (entry.action === last) factor *= 0.25;
      else if (recentActions.includes(entry.action)) factor *= 0.6;
      return { action: entry.action, weight: entry.weight * factor };
    });

  const total = adjusted.reduce((acc, e) => acc + e.weight, 0);
  if (total <= 0) return "pause";

  let r = random() * total;
  for (const entry of adjusted) {
    r -= entry.weight;
    if (r <= 0) return entry.action;
  }
  return adjusted[adjusted.length - 1].action;
}

/**
 * 飛び移る先の床を選ぶ。現在の床と直前の床（lastPerchId）は可能な限り避ける。
 */
export function pickHopTargetPerch(
  perches: readonly Perch[],
  currentPerchId: string,
  lastPerchId: string | null,
  random: () => number = Math.random,
  near?: { x: number; y: number; maxDx?: number; maxDy?: number },
): Perch | null {
  const candidates = perches.filter((p) => p.id !== currentPerchId);
  if (candidates.length === 0) return null;

  const fresh = candidates.filter((p) => p.id !== lastPerchId);
  let pool = fresh.length > 0 ? fresh : candidates;
  // 気ままな飛び移りは「届きそうな」近くの床だけにする（画面の端から端へ飛ばない）
  if (near) {
    const maxDx = near.maxDx ?? 380;
    const maxDy = near.maxDy ?? 320;
    const reachable = pool.filter((p) => {
      const dx =
        near.x < p.left
          ? p.left - near.x
          : near.x > p.right
            ? near.x - p.right
            : 0;
      return dx <= maxDx && Math.abs(p.top - near.y) <= maxDy;
    });
    if (reachable.length > 0) pool = reachable;
    else return null;
  }
  const idx = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[idx] ?? null;
}

/**
 * 現在の床が画面外に出た・消えた・大きく動いた場合に整合を取る。
 * 床が消えたときは最寄りの可視床（最下端フォールバック）へジャンプ／着地する。
 */
export function reconcilePerch(
  state: WanderState,
  roam: RoamContext,
  random: () => number = Math.random,
): WanderState {
  const { perches, actorWidth, actorHeight } = roam;
  if (perches.length === 0) return state;

  if (state.phase === "hopping" && state.hop) {
    const dest = perches.find((p) => p.id === state.hop!.toPerchId);
    if (dest) {
      const destBounds = getPerchBounds(dest, actorWidth);
      const clampedToX = clampX(state.hop.toX, destBounds);
      if (dest.top === state.hop.toY && clampedToX === state.hop.toX) {
        return state;
      }
      return {
        ...state,
        hop: { ...state.hop, toX: clampedToX, toY: dest.top },
      };
    }
    // 移動先の床が消えた → 現在の位置から最寄りの床へ軌道修正
    const fallback = findNearestPerch(perches, state.x, state.y, actorWidth);
    if (!fallback) return state;
    const toX = clampX(state.x, getPerchBounds(fallback, actorWidth));
    const hop = planHopToPerch(state.x, state.y, fallback, toX, actorHeight, {
      afterPhase: state.hop.afterPhase,
      afterFacing: state.hop.afterFacing,
      afterDurationMs: state.hop.afterDurationMs,
    });
    return {
      ...state,
      facing: toX >= state.x ? "right" : "left",
      hop,
    };
  }

  const current = perches.find((p) => p.id === state.perchId);
  if (!current) {
    // 乗っていた床が消えた（スクロールアウトなど）→ 最寄りの床へ飛び降りる
    const fallback = findNearestPerch(perches, state.x, state.y, actorWidth);
    if (!fallback) return state;
    const toX = clampX(state.x, getPerchBounds(fallback, actorWidth));
    const hop = planHopToPerch(state.x, state.y, fallback, toX, actorHeight);
    return {
      ...state,
      facing: toX >= state.x ? "right" : "left",
      phase: "hopping",
      remainingMs: 0,
      lastPerchId: state.perchId,
      perchElapsedMs: 0,
      hop,
    };
  }

  // 床は残っている → Y 座標を追従し、X を床の範囲に収める
  const bounds = getPerchBounds(current, actorWidth);
  const clampedX = clampX(state.x, bounds);
  const clampedTarget = clampX(state.targetX, bounds);

  // 大きく横方向にずれた場合はジャンプして移動
  if (Math.abs(clampedX - state.x) > 120) {
    const toX = pickPerchLandingX(current, actorWidth, random);
    const hop = planHopToPerch(state.x, state.y, current, toX, actorHeight);
    return {
      ...state,
      facing: toX >= state.x ? "right" : "left",
      phase: "hopping",
      remainingMs: 0,
      hop,
    };
  }

  if (
    current.top === state.y &&
    clampedX === state.x &&
    clampedTarget === state.targetX
  ) {
    return state;
  }

  return {
    ...state,
    x: clampedX,
    y: current.top,
    targetX: clampedTarget,
  };
}

/**
 * 指さし案内モード（pointing）への遷移を組み立てる。
 * 対象に最も近い床へ必要ならホップし、着地後に pointing へ切り替える。
 */
export function startPointingToward(
  state: WanderState,
  targetRect: { left: number; right: number; top: number; bottom: number },
  roam: RoamContext,
  durationMs = 7000,
): WanderState {
  const { perches, actorWidth, actorHeight } = roam;
  const targetCenterX = (targetRect.left + targetRect.right) * 0.5;

  const overlapsTarget = (x: number, floorY: number) =>
    x < targetRect.right &&
    x + actorWidth > targetRect.left &&
    floorY - actorHeight < targetRect.bottom &&
    floorY > targetRect.top;

  // 対象に被らない最寄りの立ち位置（横または上）を探す
  let chosenPerch: Perch | null = null;
  let chosenX = state.x;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const perch of perches) {
    const bounds = getPerchBounds(perch, actorWidth);
    const leftSpot = clampX(targetRect.left - actorWidth - 12, bounds);
    const rightSpot = clampX(targetRect.right + 12, bounds);
    const candidates = [leftSpot, rightSpot];
    for (const cx of candidates) {
      const dist = Math.hypot(
        cx + actorWidth * 0.5 - targetCenterX,
        perch.top - targetRect.bottom,
      );
      const overlapPenalty = overlapsTarget(cx, perch.top) ? 10000 : 0;
      const score = dist + overlapPenalty;
      if (score < bestScore) {
        bestScore = score;
        chosenPerch = perch;
        chosenX = cx;
      }
    }
  }

  const nearest =
    chosenPerch ??
    findNearestPerch(perches, targetCenterX, targetRect.bottom, actorWidth);
  if (!nearest) {
    return {
      ...state,
      facing: targetCenterX >= state.x + actorWidth * 0.5 ? "right" : "left",
      phase: "pointing",
      remainingMs: durationMs,
      hop: null,
    };
  }

  const toX = chosenPerch
    ? chosenX
    : clampX(
        targetRect.left - actorWidth - 12,
        getPerchBounds(nearest, actorWidth),
      );
  const pointFacing: WanderFacing =
    targetCenterX >= toX + actorWidth * 0.5 ? "right" : "left";

  const alreadyClose =
    nearest.id === state.perchId && Math.abs(toX - state.x) < 40;

  // 同じ床の上で離れている、または遠すぎて一跳びで届かないときは、
  // その場で対象の方を向いて手を挙げる（床の上を跳んで横切らない）。
  const sameFloorFar = nearest.id === state.perchId && !alreadyClose;
  const tooFarToHop =
    nearest.id !== state.perchId && Math.abs(toX - state.x) > 380;
  if (sameFloorFar || tooFarToHop) {
    const here = state.x + actorWidth * 0.5;
    return {
      ...state,
      facing: targetCenterX >= here ? "right" : "left",
      phase: "pointing",
      remainingMs: durationMs,
      hop: null,
    };
  }

  if (alreadyClose) {
    return {
      ...state,
      x: toX,
      y: nearest.top,
      targetX: toX,
      facing: pointFacing,
      phase: "pointing",
      remainingMs: durationMs,
      perchId: nearest.id,
      hop: null,
    };
  }

  const hop = planHopToPerch(state.x, state.y, nearest, toX, actorHeight, {
    afterPhase: "pointing",
    afterFacing: pointFacing,
    afterDurationMs: durationMs,
  });

  return {
    ...state,
    facing: toX >= state.x ? "right" : "left",
    phase: "hopping",
    remainingMs: 0,
    lastPerchId: state.perchId,
    hop,
  };
}

/** 次の行動（walk / hop / greet / sit / pause）へ切り替える共通処理（roam 時） */
function transitionToNextRoamAction(
  state: WanderState,
  currentPerch: Perch,
  roam: RoamContext,
  config: WanderConfig,
  random: () => number,
): WanderState {
  const bounds = getPerchBounds(currentPerch, roam.actorWidth);
  const span = bounds.maxX - bounds.minX;
  const otherPerchesExist = roam.perches.some((p) => p.id !== currentPerch.id);

  // 要素の床に 8 秒以上留まっている場合は必ず別床へ移動
  const mustLeavePerch =
    currentPerch.kind === "element" &&
    state.perchElapsedMs >= config.maxPerchStayMs &&
    otherPerchesExist;

  // 基本はその場（足踏み・立ち止まり・正面）。移動の時間が来たときだけ、
  // 画面の別の場所へ歩いて行くか飛び移る。
  const relocate = mustLeavePerch || state.relocateInMs <= 0;
  let chosen: WanderActionKind;
  if (mustLeavePerch) {
    chosen = "hop";
  } else if (relocate) {
    const pick = pickNextRoamAction(
      state.recentActions,
      {
        canWalk: span > 12,
        canHop: otherPerchesExist,
        canGreet: false,
        canSit: false,
      },
      random,
    );
    chosen =
      pick === "hop" && otherPerchesExist
        ? "hop"
        : span > 12 || !otherPerchesExist
          ? "walk"
          : "hop";
  } else {
    chosen = pickLocalAction(
      state.recentActions,
      {
        canGreet: config.greetChance > 0,
        canSit: config.greetChance > 0,
      },
      random,
    );
  }

  if (chosen === "step") {
    return startStepping(state, bounds, config, random);
  }

  if (relocate) {
    return transitionAfterRelocateChoice(
      { ...state, relocateInMs: nextRelocateDelay(config, random) },
      chosen,
      currentPerch,
      roam,
      config,
      random,
      mustLeavePerch,
    );
  }
  return transitionAfterRelocateChoice(
    state,
    chosen,
    currentPerch,
    roam,
    config,
    random,
    mustLeavePerch,
  );
}

function transitionAfterRelocateChoice(
  state: WanderState,
  initialChoice: WanderActionKind,
  currentPerch: Perch,
  roam: RoamContext,
  config: WanderConfig,
  random: () => number,
  mustLeavePerch: boolean,
): WanderState {
  let chosen = initialChoice;
  const span =
    getPerchBounds(currentPerch, roam.actorWidth).maxX -
    getPerchBounds(currentPerch, roam.actorWidth).minX;

  const nextRecent = pushAction(state.recentActions, chosen);

  if (chosen === "hop") {
    const nextPerch = pickHopTargetPerch(
      roam.perches,
      currentPerch.id,
      state.lastPerchId,
      random,
      mustLeavePerch
        ? undefined
        : { x: state.x + roam.actorWidth * 0.5, y: state.y },
    );
    if (nextPerch) {
      const toX = pickPerchLandingX(nextPerch, roam.actorWidth, random);
      const hop = planHopToPerch(
        state.x,
        state.y,
        nextPerch,
        toX,
        roam.actorHeight,
      );
      return {
        ...state,
        facing: toX >= state.x ? "right" : "left",
        phase: "hopping",
        remainingMs: 0,
        glancedDuringPause: false,
        lastPerchId: currentPerch.id,
        recentActions: nextRecent,
        hop,
      };
    }
    // 届く床が無ければ、床の上を歩いて移る
    chosen = "walk";
  }

  if (chosen === "greet") {
    const greetMs =
      config.minGreetMs +
      random() * Math.max(0, config.maxGreetMs - config.minGreetMs);
    return {
      ...state,
      targetX: state.x,
      phase: "greeting",
      remainingMs: greetMs,
      glancedDuringPause: false,
      recentActions: nextRecent,
      hop: null,
    };
  }

  if (chosen === "sit") {
    const sitMs =
      config.minSitMs +
      random() * Math.max(0, config.maxSitMs - config.minSitMs);
    return {
      ...state,
      targetX: state.x,
      phase: "sitting",
      remainingMs: sitMs,
      glancedDuringPause: false,
      recentActions: nextRecent,
      hop: null,
    };
  }

  if (chosen === "walk" && span > 12) {
    const nextTarget = pickTargetOnPerch(
      state.x,
      currentPerch,
      roam.actorWidth,
      config,
      random,
    );
    const nextFacing: WanderFacing = nextTarget >= state.x ? "right" : "left";
    const needsTurn = nextFacing !== state.facing;
    return {
      ...state,
      targetX: nextTarget,
      facing: nextFacing,
      phase: needsTurn ? "turning" : "walking",
      remainingMs: needsTurn ? config.turnBeatMs : 0,
      glancedDuringPause: false,
      recentActions: nextRecent,
      hop: null,
    };
  }

  const pauseMs =
    config.minPauseMs +
    random() * Math.max(0, config.maxPauseMs - config.minPauseMs);
  return {
    ...state,
    targetX: state.x,
    phase: "paused",
    remainingMs: pauseMs,
    glancedDuringPause: false,
    recentActions: nextRecent,
    hop: null,
  };
}

export function stepWanderState(
  prev: WanderState,
  deltaMs: number,
  bounds: WanderBounds,
  config: WanderConfig,
  random: () => number = Math.random,
  roam?: RoamContext,
): WanderState {
  // タブ復帰時などの大きなフレーム飛びを抑える（タイマー駆動時はそのまま渡せるよう
  // 移動・ホップフェーズのみ 100ms 上限を掛ける）
  const isMovingPhase =
    prev.phase === "walking" ||
    prev.phase === "hopping" ||
    prev.phase === "stepping";
  const dt = isMovingPhase
    ? Math.min(Math.max(0, deltaMs), 100)
    : Math.max(0, deltaMs);
  if (dt === 0) return prev;

  // 2D 自由移動モード: まず現在の床と同期する
  const reconciled = roam ? reconcilePerch(prev, roam, random) : prev;
  // 移動の時間までの残りは、その場で過ごしている間だけ減らす
  const relocating =
    reconciled.phase === "walking" || reconciled.phase === "hopping";
  const synced: WanderState = {
    ...reconciled,
    relocateInMs: relocating
      ? (reconciled.relocateInMs ?? 0)
      : (reconciled.relocateInMs ?? 0) - dt,
  };
  const currentPerch = roam
    ? (roam.perches.find((p) => p.id === synced.perchId) ??
      roam.perches.find((p) => p.kind === "bottom") ??
      roam.perches[0])
    : undefined;

  const activeBounds =
    roam && currentPerch
      ? getPerchBounds(currentPerch, roam.actorWidth)
      : bounds;

  const perchElapsedMs =
    currentPerch &&
    currentPerch.kind === "element" &&
    synced.phase !== "hopping"
      ? synced.perchElapsedMs + dt
      : synced.perchElapsedMs;

  // hopping（放物線ジャンプ中）
  if (synced.phase === "hopping" && synced.hop) {
    const nextElapsed = synced.hop.elapsedMs + dt;
    const updatedHop: HopArc = { ...synced.hop, elapsedMs: nextElapsed };
    const pos = evaluateHopPosition(updatedHop);

    if (nextElapsed >= updatedHop.durationMs) {
      const landedPhase = updatedHop.afterPhase ?? "paused";
      const landedDuration =
        updatedHop.afterDurationMs ??
        (landedPhase === "pointing"
          ? 7000
          : config.minPauseMs * 0.65 +
            random() *
              Math.max(0, (config.maxPauseMs - config.minPauseMs) * 0.4));
      return {
        ...synced,
        x: updatedHop.toX,
        y: updatedHop.toY,
        targetX: updatedHop.toX,
        facing: updatedHop.afterFacing ?? synced.facing,
        phase: landedPhase,
        remainingMs: landedDuration,
        glancedDuringPause: false,
        perchId: updatedHop.toPerchId,
        perchElapsedMs: 0,
        hop: null,
      };
    }

    return {
      ...synced,
      x: pos.x,
      y: pos.y,
      hop: updatedHop,
    };
  }

  const clampedX = clampX(synced.x, activeBounds);
  const clampedTarget = clampX(synced.targetX, activeBounds);

  // stepping（その場の足踏み。向いている側へだけ数 px にじり寄る）
  if (synced.phase === "stepping") {
    const remaining = synced.remainingMs - dt;
    const dir = synced.facing === "right" ? 1 : -1;
    const distance = clampedTarget - clampedX;
    const step = (config.stepDriftPxPerSec * dt) / 1000;
    let nextX = clampedX;
    if (Math.sign(distance) === dir) {
      nextX =
        Math.abs(distance) <= step ? clampedTarget : clampedX + dir * step;
    }
    if (remaining > 0) {
      return {
        ...synced,
        x: nextX,
        targetX: Math.sign(distance) === dir ? clampedTarget : nextX,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }
    if (roam && currentPerch) {
      return transitionToNextRoamAction(
        { ...synced, x: nextX, targetX: nextX, perchElapsedMs },
        currentPerch,
        roam,
        config,
        random,
      );
    }
    return {
      ...synced,
      x: nextX,
      targetX: nextX,
      phase: "paused",
      remainingMs: config.minPauseMs,
      perchElapsedMs,
    };
  }

  // pointing（案内中）
  if (synced.phase === "pointing") {
    const remaining = synced.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }
    return {
      ...synced,
      x: clampedX,
      targetX: clampedTarget,
      phase: "paused",
      remainingMs: config.afterGreetMs,
      glancedDuringPause: true,
      perchElapsedMs,
    };
  }

  // sitting（ひと休み中）
  if (synced.phase === "sitting") {
    const remaining = synced.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }
    return {
      ...synced,
      x: clampedX,
      targetX: clampedTarget,
      phase: "paused",
      remainingMs: config.afterGreetMs,
      glancedDuringPause: true,
      perchElapsedMs,
    };
  }

  if (!roam && activeBounds.maxX - activeBounds.minX <= 8) {
    return {
      ...synced,
      x: clampedX,
      targetX: clampedX,
      phase: "paused",
      remainingMs: config.minPauseMs,
    };
  }

  if (synced.phase === "turning") {
    const remaining = synced.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }
    return {
      ...synced,
      x: clampedX,
      targetX: clampedTarget,
      phase: "walking",
      remainingMs: 0,
      perchElapsedMs,
    };
  }

  if (synced.phase === "greeting") {
    const remaining = synced.remainingMs - dt;
    if (remaining > 0) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }
    // 横向きに戻って、少し間を置いてから歩き出す（見渡しは省く）
    return {
      ...synced,
      x: clampedX,
      targetX: clampedTarget,
      phase: "paused",
      remainingMs: config.afterGreetMs,
      glancedDuringPause: true,
      perchElapsedMs,
    };
  }

  if (synced.phase === "paused") {
    const remaining = synced.remainingMs - dt;

    // 要素の床に 8 秒以上いたら切り上げて次へ移る
    if (
      roam &&
      currentPerch &&
      currentPerch.kind === "element" &&
      perchElapsedMs >= config.maxPerchStayMs
    ) {
      return transitionToNextRoamAction(
        { ...synced, x: clampedX, perchElapsedMs },
        currentPerch,
        roam,
        config,
        random,
      );
    }

    // 立ち止まりの後半で、ときどき反対側をそっと見渡す
    if (
      !synced.glancedDuringPause &&
      remaining > 900 &&
      remaining < config.minPauseMs * 0.55 &&
      random() < 0.35
    ) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        facing: synced.facing === "left" ? "right" : "left",
        remainingMs: remaining,
        glancedDuringPause: true,
        perchElapsedMs,
      };
    }

    if (remaining > 0) {
      return {
        ...synced,
        x: clampedX,
        targetX: clampedTarget,
        remainingMs: remaining,
        perchElapsedMs,
      };
    }

    if (roam && currentPerch) {
      return transitionToNextRoamAction(
        { ...synced, x: clampedX, perchElapsedMs },
        currentPerch,
        roam,
        config,
        random,
      );
    }

    const nextTarget = pickNextTargetX(clampedX, activeBounds, config, random);
    const nextFacing: WanderFacing = nextTarget >= clampedX ? "right" : "left";
    const needsTurn = nextFacing !== synced.facing;

    return {
      ...synced,
      x: clampedX,
      targetX: nextTarget,
      facing: nextFacing,
      phase: needsTurn ? "turning" : "walking",
      remainingMs: needsTurn ? config.turnBeatMs : 0,
      glancedDuringPause: false,
      perchElapsedMs,
    };
  }

  // walking
  const distance = clampedTarget - clampedX;
  const step = (config.speedPxPerSec * dt) / 1000;

  if (Math.abs(distance) <= step) {
    if (roam && currentPerch) {
      // 目的地に着いたら、そのまま次の行動（ひと休み・手を振る・別床へジャンプなど）を選ぶ
      const arrived: WanderState = {
        ...synced,
        x: clampedTarget,
        targetX: clampedTarget,
        perchElapsedMs,
      };
      // 要素の床で上限超過なら即ジャンプ、それ以外は軽く立ち止まるか greet/sit
      if (
        currentPerch.kind === "element" &&
        perchElapsedMs >= config.maxPerchStayMs
      ) {
        return transitionToNextRoamAction(
          arrived,
          currentPerch,
          roam,
          config,
          random,
        );
      }
      const r = random();
      if (config.greetChance > 0 && r < config.greetChance * 0.65) {
        const greetMs =
          config.minGreetMs +
          random() * Math.max(0, config.maxGreetMs - config.minGreetMs);
        return {
          ...arrived,
          phase: "greeting",
          remainingMs: greetMs,
          glancedDuringPause: false,
          recentActions: pushAction(synced.recentActions, "greet"),
        };
      }
      if (config.greetChance > 0 && r < config.greetChance) {
        const sitMs =
          config.minSitMs +
          random() * Math.max(0, config.maxSitMs - config.minSitMs);
        return {
          ...arrived,
          phase: "sitting",
          remainingMs: sitMs,
          glancedDuringPause: false,
          recentActions: pushAction(synced.recentActions, "sit"),
        };
      }
      const pauseMs =
        config.minPauseMs +
        random() * Math.max(0, config.maxPauseMs - config.minPauseMs);
      return {
        ...arrived,
        phase: "paused",
        remainingMs: pauseMs,
        glancedDuringPause: false,
        recentActions: pushAction(synced.recentActions, "pause"),
      };
    }

    // 1D モード（既存動作）
    if (config.greetChance > 0 && random() < config.greetChance) {
      const greetMs =
        config.minGreetMs +
        random() * Math.max(0, config.maxGreetMs - config.minGreetMs);
      return {
        ...synced,
        x: clampedTarget,
        targetX: clampedTarget,
        facing: synced.facing,
        phase: "greeting",
        remainingMs: greetMs,
        glancedDuringPause: false,
      };
    }
    const pauseMs =
      config.minPauseMs +
      random() * Math.max(0, config.maxPauseMs - config.minPauseMs);
    return {
      ...synced,
      x: clampedTarget,
      targetX: clampedTarget,
      facing: synced.facing,
      phase: "paused",
      remainingMs: pauseMs,
      glancedDuringPause: false,
    };
  }

  const nextX = clampedX + Math.sign(distance) * step;
  return {
    ...synced,
    x: nextX,
    targetX: clampedTarget,
    facing: distance > 0 ? "right" : "left",
    perchElapsedMs,
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
