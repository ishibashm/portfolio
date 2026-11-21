/**
 * しるべが乗れる「床（perch）」の検出（純粋関数 + 薄い DOM 収集）。
 *
 * - 画面最下端（kind: "bottom"）は常に床として含める。
 * - 追加の床は `[data-shirube-perch]` と既定セレクタに一致する可視要素の上端。
 * - `[data-shirube-avoid]`・フォーカス中入力・主要送信ボタンの上には乗らない。
 * - PC は最大 12 個、スマホ（< 640px）は最大 4 個（幅 200px 以上のみ）に制限する。
 */

export interface Perch {
  id: string;
  left: number;
  right: number;
  /** ビューポート上端からの床面 Y 座標（px） */
  top: number;
  kind: "bottom" | "element";
}

export interface PerchCandidate {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  visible?: boolean;
  insideStage?: boolean;
  insideAvoid?: boolean;
  isPrimaryCta?: boolean;
  isFocusedInput?: boolean;
  explicit?: boolean;
}

export interface AvoidRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FindPerchesOptions {
  actorHeight?: number;
  actorWidth?: number;
  edgeMarginPx?: number;
  /** 画面最下端の持ち上げ量（固定 CTA・safe-area 分） */
  bottomLiftPx?: number;
  maxDesktopPerches?: number;
  maxMobilePerches?: number;
  minDesktopWidth?: number;
  minMobileWidth?: number;
  avoidRects?: readonly AvoidRect[];
}

export const DEFAULT_PERCH_SELECTORS = [
  "[data-shirube-perch]",
  "main h2",
  "main h3",
  "main article",
  'main section > div[class*="rounded"]',
  "main button",
  'main a[class*="rounded-full"]',
] as const;

const AVOID_RECT_SELECTOR = [
  "[data-shirube-avoid]",
  'button[type="submit"]',
  "[data-primary-cta]",
].join(", ");

const FORM_INPUT_SELECTOR = "input, textarea, select, [contenteditable='true']";

function rectsOverlap(
  aLeft: number,
  aRight: number,
  aTop: number,
  aBottom: number,
  b: AvoidRect,
): boolean {
  return (
    aLeft < b.right && aRight > b.left && aTop < b.bottom && aBottom > b.top
  );
}

/**
 * 候補矩形から、しるべが乗れる床の一覧を計算する（純粋関数）。
 */
export function findPerches(
  rects: readonly PerchCandidate[],
  viewport: { width: number; height: number },
  opts: FindPerchesOptions = {},
): Perch[] {
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);
  const isMobile = vw < 640;

  const actorHeight = opts.actorHeight ?? (isMobile ? 60 : 120);
  const actorWidth = opts.actorWidth ?? (isMobile ? 30 : 59);
  const edgeMarginPx = opts.edgeMarginPx ?? 16;
  const bottomLiftPx = Math.max(0, opts.bottomLiftPx ?? 0);
  const maxPerches = isMobile
    ? (opts.maxMobilePerches ?? 4)
    : (opts.maxDesktopPerches ?? 12);
  const minWidth = isMobile
    ? (opts.minMobileWidth ?? 200)
    : (opts.minDesktopWidth ?? 120);
  const avoidRects = opts.avoidRects ?? [];

  const bottomTop = Math.max(0, vh - bottomLiftPx);
  const bottomLeft = Math.min(edgeMarginPx, Math.max(0, vw - actorWidth));
  const bottomRight = Math.max(bottomLeft, vw - edgeMarginPx);

  const bottomPerch: Perch = {
    id: "bottom",
    left: bottomLeft,
    right: bottomRight,
    top: bottomTop,
    kind: "bottom",
  };

  if (maxPerches <= 1 || vw <= 0 || vh <= 0) {
    return [bottomPerch];
  }

  const minTop = actorHeight + 16;
  const maxTop = bottomTop - 24;

  const valid: (Perch & { explicit: boolean; width: number })[] = [];

  for (const c of rects) {
    if (c.visible === false) continue;
    if (c.insideStage || c.insideAvoid || c.isPrimaryCta || c.isFocusedInput) {
      continue;
    }
    if (c.width < minWidth || c.height <= 0) continue;
    if (c.top < minTop || c.top > maxTop) continue;
    if (c.bottom <= 0 || c.top >= vh) continue;

    const left = Math.max(edgeMarginPx, c.left);
    const right = Math.min(vw - edgeMarginPx, c.right);
    const usableWidth = right - left;
    if (usableWidth < minWidth) continue;

    // しるべが立つ空間 [left, right] × [top - actorHeight, top + 4] が
    // 避けるべき領域（送信ボタン・入力欄・data-shirube-avoid）に被るなら除外
    const overlapsAvoid = avoidRects.some((a) =>
      rectsOverlap(left, right, c.top - actorHeight, c.top + 4, a),
    );
    if (overlapsAvoid) continue;

    valid.push({
      id: c.id,
      left,
      right,
      top: Math.round(c.top),
      kind: "element",
      explicit: Boolean(c.explicit),
      width: usableWidth,
    });
  }

  // 同じ高さ（10px 以内）かつ横方向に重なる重複床を間引く（明示指定・幅広を優先）
  valid.sort((a, b) => {
    if (a.explicit !== b.explicit) return a.explicit ? -1 : 1;
    if (a.top !== b.top) return a.top - b.top;
    return b.width - a.width;
  });

  const deduped: typeof valid = [];
  for (const p of valid) {
    const duplicate = deduped.some(
      (q) =>
        Math.abs(q.top - p.top) <= 10 &&
        p.left < q.right - 8 &&
        p.right > q.left + 8,
    );
    if (!duplicate) deduped.push(p);
  }

  // 上限（bottom を含めて maxPerches）まで選ぶ。明示指定を優先しつつ画面全体に分散させる
  const maxElements = Math.max(0, maxPerches - 1);
  let chosen = deduped;
  if (deduped.length > maxElements) {
    const explicitOnes = deduped.filter((p) => p.explicit);
    const autoOnes = deduped.filter((p) => !p.explicit);
    const picked: typeof valid = explicitOnes.slice(0, maxElements);
    const remaining = maxElements - picked.length;
    if (remaining > 0 && autoOnes.length > 0) {
      // 上から下へ均等に間引いて画面全体を歩けるようにする
      const sortedAuto = [...autoOnes].sort((a, b) => a.top - b.top);
      const step = sortedAuto.length / remaining;
      for (let i = 0; i < remaining; i += 1) {
        const idx = Math.min(
          sortedAuto.length - 1,
          Math.floor(i * step + step * 0.5),
        );
        const item = sortedAuto[idx];
        if (item && !picked.includes(item)) picked.push(item);
      }
    }
    chosen = picked;
  }

  const elementPerches: Perch[] = chosen
    .sort((a, b) => a.top - b.top)
    .map(({ id, left, right, top, kind }) => ({ id, left, right, top, kind }));

  return [bottomPerch, ...elementPerches];
}

/**
 * 指定座標 (x, y) から最も近い可視の床を返す（フォールバックは最下端）。
 */
export function findNearestPerch(
  perches: readonly Perch[],
  x: number,
  y: number,
  actorWidth: number,
  excludeId?: string | null,
): Perch | null {
  if (perches.length === 0) return null;
  let best: Perch | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const p of perches) {
    if (excludeId && p.id === excludeId) continue;
    const minX = p.left;
    const maxX = Math.max(minX, p.right - actorWidth);
    const clampedX = Math.min(maxX, Math.max(minX, x));
    const dx = clampedX - x;
    const dy = p.top - y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }

  return best ?? perches.find((p) => p.kind === "bottom") ?? perches[0] ?? null;
}

/**
 * 床の上の着地 X 座標を選ぶ。
 * 要素の床（kind: "element"）では本文を隠さないよう、左右 20% の端を優先する。
 */
export function pickPerchLandingX(
  perch: Perch,
  actorWidth: number,
  random: () => number = Math.random,
  preferSide?: "left" | "right",
): number {
  const minX = perch.left;
  const maxX = Math.max(minX, perch.right - actorWidth);
  const span = maxX - minX;
  if (span <= 4) return minX;

  if (perch.kind === "element") {
    const edgeSpan = Math.max(
      4,
      (perch.right - perch.left) * 0.2 - actorWidth * 0.25,
    );
    const side = preferSide ?? (random() < 0.5 ? "left" : "right");
    if (side === "left") {
      return Math.min(maxX, minX + random() * Math.min(span, edgeSpan));
    }
    return Math.max(minX, maxX - random() * Math.min(span, edgeSpan));
  }

  return minX + random() * span;
}

/**
 * 安定した要素 ID を生成する（DOM 読み取り用）。
 */
function buildPerchId(el: Element, index: number): string {
  const explicit = el.getAttribute("data-shirube-perch");
  if (explicit && explicit.trim()) return `perch:${explicit.trim()}`;
  const tip = el.getAttribute("data-shirube-tip");
  if (tip && tip.trim()) return `tip:${tip.trim()}`;
  if (el.id) return `el:#${el.id}`;
  const tag = el.tagName.toLowerCase();
  return `el:${tag}:${index}`;
}

function isElementVisible(el: Element, win: Window): boolean {
  if (typeof win.getComputedStyle !== "function") return true;
  const style = win.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }
  return true;
}

/**
 * DOM から避けるべき矩形（`data-shirube-avoid`・送信ボタン・主要 CTA・フォーカス中入力）を集める。
 */
export function collectAvoidRects(
  doc: Document = document,
  win: Window = window,
): AvoidRect[] {
  const out: AvoidRect[] = [];
  const seen = new Set<Element>();

  const pushEl = (el: Element) => {
    if (seen.has(el)) return;
    if (el.closest(".shirube-wander-stage")) return;
    seen.add(el);
    if (!isElementVisible(el, win)) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    out.push({
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
    });
  };

  doc.querySelectorAll(AVOID_RECT_SELECTOR).forEach(pushEl);

  const active = doc.activeElement;
  if (active && active !== doc.body && active.matches(FORM_INPUT_SELECTOR)) {
    pushEl(active);
  }

  return out;
}

/**
 * DOM から床候補を収集する（薄い DOM アダプタ）。
 */
export function collectPerchCandidates(
  doc: Document = document,
  win: Window = window,
  selectors: readonly string[] = DEFAULT_PERCH_SELECTORS,
): PerchCandidate[] {
  const combined = selectors.join(", ");
  if (!combined) return [];

  let elements: NodeListOf<Element>;
  try {
    elements = doc.querySelectorAll(combined);
  } catch {
    return [];
  }

  const active = doc.activeElement;
  const candidates: PerchCandidate[] = [];
  let idx = 0;

  elements.forEach((el) => {
    const insideStage = Boolean(el.closest(".shirube-wander-stage"));
    const insideAvoid = Boolean(el.closest("[data-shirube-avoid]"));
    const isPrimaryCta =
      el.matches('button[type="submit"], [data-primary-cta]') ||
      Boolean(el.closest("[data-primary-cta]"));
    const isFocusedInput = Boolean(
      active &&
      (el === active || el.contains(active)) &&
      active.matches(FORM_INPUT_SELECTOR),
    );
    const visible = isElementVisible(el, win);
    const r = el.getBoundingClientRect();
    const explicit = el.hasAttribute("data-shirube-perch");

    candidates.push({
      id: buildPerchId(el, idx),
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      visible,
      insideStage,
      insideAvoid,
      isPrimaryCta,
      isFocusedInput,
      explicit,
    });
    idx += 1;
  });

  return candidates;
}
